const fs = require('fs');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { errorEmbed } = require('../commonFunctions.js');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removebid')
    .setDescription('removes a bid (staff only)')
    .addStringOption(option =>
        option.setName('bid')
            .setDescription('the bid to remove')
            .setRequired(true)
            .setAutocomplete(true)
    ),
    async autocomplete(interaction, client, supabase, dkpSheet, pppSheet, tallySheet, auctions, itemList, auctionList, userList) {
        const focusedValue = interaction.options.getFocused(true);
        let bidList = auctionList.reduce((a, b) => a.concat(b.bids.map(c => ({ item: b.item.name, type: b.item.type, user: c.user, amount: c.amount }))), []).filter((a, i, arr) => arr.find(b => b.item == a.item && b.user == a.user && b.amount > a.amount) == null);
        await interaction.respond(bidList.map(a => ({ name: `${a.user}: ${a.item} (${a.amount} ${a.type})`, value: `${a.item}:${a.user}` })).filter(a => a.name.toLowerCase().includes(focusedValue.value.toLowerCase())).sort((a, b) => a.name > b.name ? 1 : -1).slice(0, 25));
    },
    ephemeral: true,
    async execute(interaction, client, author, supabase, dkpSheet, pppSheet, tallySheet, auctions, dkpChannel, pppChannel, rollChannel, googleSheets) {
        let bid = interaction.options.getString('bid').split(':');
        let username = bid.splice(bid.length - 1);
        let item = bid.join(':');

        if (!author.staff) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription(`This command is only available to staff.`);
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }

        if (item == null || username == null) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription('You must use the autocomplete choices')
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }

        let { data: auction, error } = await supabase.from(config.supabase.tables.auctions).select('bids, item (name, type, monster, tradeable), host').eq('item', item).eq('open', true).limit(1);
        if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Fetching Auction', error.message)] });
        auction = auction[0];

        if (auction == null) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription(`There are no open auctions for **${item}**.`);
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }

        let index = auction.bids.findLastIndex(a => a.user == username);
        if (index == -1) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription(`**${username}** has not placed a bid on **${item}**.`);
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }
        auction.bids.splice(index, 1);
        
        ({ error } = await supabase.from(config.supabase.tables.auctions).update({
            bids: auction.bids,
            winner: auction.bids.length == 0 ? null : auction.bids.filter(a => a.amount == auction.bids[auction.bids.length - 1].amount).map(a => a.user).join(', '),
            price: auction.bids.length == 0 ? null : auction.bids[auction.bids.length - 1].amount
        }).eq('item', auction.item.name).eq('open', true));
        if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Closing Auction', error.message)] });

        let newEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`Bid Removed`)
                .setDescription(`**${username}**'s bid on **${item}** has been removed`)
        await interaction.editReply({ embeds: [newEmbed] });

        auction.bids.sort((a, b) => b.amount - a.amount);
        if (auctions[item]?.[auction.item.type]) {
            auction.bids.sort((a, b) => b.amount - a.amount);
            const logEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`Auction for ${auction.item.name} (Open)`)
                .addFields(
                    { name: 'Next Bid', value: `${auction.bids.length == 0 ? 0 : auction.bids[0].amount + config.auction[auction.item.type].raise} ${auction.item.type}` },
                    { name: 'Bids', value: `\`\`\`${auction.bids.length == 0 ? '​' : auction.bids.slice(0, 15).map(a => `${a.user}: ${a.amount} ${auction.item.type}`).join('\n')}${auction.bids.length > 10 ? '\n...' : ''}\`\`\`` }
                )
                .setFooter({ text: `Opened by ${auction.host}` })
                .setTimestamp();
            auctions[item][auction.item.type].embed = newEmbed;
            await auctions[item][auction.item.type].message.edit({ embeds: [logEmbed] });
        }
        if (auctions[auction.item.monster]?.[auction.item.type]) {
            let newEmbed = auctions[auction.item.monster][auction.item.type].embed;
            if (newEmbed.data) newEmbed = newEmbed.data;
            let highestBids = auction.bids.filter(a => a.amount == auction.bids[0].amount);
            let field = newEmbed.fields.findIndex(a => a.name.startsWith(`${auction.item.tradeable ? '💰 ' : ''}**[${auction.item.name}]**`));
            if (field != -1) {
                newEmbed.fields[field].name = `${auction.item.tradeable ? '💰 ' : ''}**[${auction.item.name}]** __${highestBids.length == 0 ? '*No Bids*' : `*Current Bid: **(${highestBids[0].amount} ${item.type})***`}__`;
                for (let i = 0; i == 0 || newEmbed.fields[field].value.length > 1024; i++) newEmbed.fields[field].value = highestBids.length == 0 ? '​' : `**Highest Bid${highestBids.length == 1 ? '' : 's'}:**\n🥇${highestBids.map(a => a.user).slice(0, highestBids.length - i).join(', ')}${i == 0 ? '' : ', ...'} (${highestBids[0].amount} ${item.type})`;
                auctions[auction.item.monster][auction.item.type].embed = newEmbed;
                await auctions[auction.item.monster][auction.item.type].message.edit({ embeds: [newEmbed] });
            }
        }

        try {
            fs.writeFileSync('./auctions.json', JSON.stringify(auctions, '', '  '));
        } catch (err) {
            console.log('Error saving auctions:', err);
        }
    }
}
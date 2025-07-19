const fs = require('fs');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { errorEmbed } = require('../commonFunctions.js');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('closeitem')
    .setDescription('closes an auction on an item')
    .addStringOption(option =>
        option.setName('item')
            .setDescription('the item to close bidding on')
            .setRequired(true)
            .setAutocomplete(true)
    ),
    async autocomplete(interaction, client, supabase, dkpSheet, pppSheet, tallySheet, auctions, itemList, auctionList, userList) {
        const focusedValue = interaction.options.getFocused(true);
        await interaction.respond(auctionList.filter(a => a.item.name.toLowerCase().includes(focusedValue.value.toLowerCase()) && auctions[a.item.monster] == null).map(a => ({ name: a.item.name, value: a.item.name })).sort((a, b) => a.name > b.name ? 1 : -1).slice(0, 25));
    },
    ephemeral: true,
    async execute(interaction, client, author, supabase, dkpSheet, pppSheet, tallySheet, auctions, dkpChannel, pppChannel, rollChannel, googleSheets) {
        let item = interaction.options.getString('item');
        
        let { data: auction, error } = await supabase.from(config.supabase.tables.auctions).select('bids, item (name, type, monster)').eq('item', item).eq('open', true).limit(1);
        if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Fetching Auction', error.message)] });
        auction = auction[0];

        if (auction == null || auctions[auction.item.monster] != null) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription(`There are no open auctions for **${item}**.`);
            await interaction.editReply({ embeds: [errorEmbed] });
            
            if (auctions[item]?.[auction.item.type]) {
                auction.bids.sort((a, b) => b.amount - a.amount);
                const logEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle(`Auction for ${auction.item.name} (Closed)`)
                    .addFields(
                        { name: 'Next Bid', value: auction.bids.length == 0 ? `${config.auction[auction.item.type].min} ${auction.item.type}` : `${auction.bids[0].amount + config.auction[auction.item.type].raise} ${auction.item.type}` },
                        { name: 'Bids', value: `\`\`\`${auction.bids.length == 0 ? '​' : auction.bids.slice(0, 15).map(a => `${a.user}: ${a.amount} ${auction.item.type}`).join('\n')}${auction.bids.length > 10 ? '\n...' : ''}\`\`\`` }
                    )
                    .setFooter({ text: `Closed by ${author.username}` })
                    .setTimestamp();
                await auctions[item][auction.item.type].message.edit({ embeds: [logEmbed], components: [] });
                delete auctions[item];
            }

            return;
        }

        let frozen = 0;
        if (auction.item.type == 'DKP' && author.frozen) {
            frozen++;
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Account Frozen')
                .setDescription('Your account is frozen. You cannot manage auctions or place bids on DKP items this time.');
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }

        let winners = auction.bids.filter(a => a.amount == auction.bids[auction.bids.length - 1].amount);
        let winner;
        if (winners.length > 1) {
            let rollEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`Rolls for ${auction.item.name}${winners.filter(a => a.wipe).length == 1 ? ` (Forcing winner to ${winners.find(a => a.wipe).user})` : ''}`);
            let message = await rollChannel.send({ embeds: [rollEmbed] });
            do {
                winners.forEach(a => delete a.roll);
                for (let item of winners) {
                    await message.edit({ embeds: [rollEmbed] });
                    do {
                        item.roll = Math.floor(Math.random() * 1000);
                    } while (winners.filter(a => a.roll == item.roll).length > 1);
                }
                winner = winners.reduce((a, b) => (a == null || b.roll > a.roll) ? b : a, null);
            } while (!(winners.find(a => a.wipe) == null || winner.wipe));
            for (let item of winners) {
                rollEmbed.data.description = `${rollEmbed.data.description || ''}\n${item.user}: ${item.roll}`.trim();
                await message.edit({ embeds: [rollEmbed] });
            }
            rollEmbed.data.description += `\n\n**Winner:** ${winner.user}`;
            await message.edit({ embeds: [rollEmbed] });
        } else winner = winners.sort((a, b) => b.amount - a.amount)[0];
        ({ error } = await supabase.from(config.supabase.tables.auctions).update({
            open: false,
            end: 'now()',
            winner: winner?.user,
            price: winner?.amount,
            closer: author.username
        }).eq('item', auction.item.name).eq('open', true));
        if (auction.bids.length > 0) {
            if (config.google[auction.item.type].log != '') {
                await googleSheets.spreadsheets.values.append({
                    spreadsheetId: config.google[auction.item.type].id,
                    range: config.google[auction.item.type].log,
                    valueInputOption: 'RAW',
                    resource: {
                        values: [
                            [
                                winner.user,
                                auction.item.name,
                                auction.item.monster,
                                `${winner.amount} ${auction.item.type.toLowerCase() == 'dkp' ? 'dkp' : 'PPP'}`,
                                new Date().toLocaleString()
                            ]
                        ]
                    }
                });
            }
        }

        if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Closing Auction', error.message)] });
        let newEmbed;
        if (auction.bids.length == 0) {
            newEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`Auction Closed for ${auction.item.name}`)
                .setDescription(`No bids were placed.`)
        } else {
            newEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`Auction Closed for ${auction.item.name}`)
                .setDescription(`Winner: ${winner.user} (${winner.amount} ${auction.item.type})`)
        }
        await interaction.editReply({ embeds: [newEmbed] });

        if (auctions[item]?.[auction.item.type]) {
            auction.bids.sort((a, b) => b.amount - a.amount);
            const logEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`Auction for ${auction.item.name} (Closed)`)
                .addFields(
                    { name: 'Next Bid', value: auction.bids.length == 0 ? `${config.auction[auction.item.type].min} ${auction.item.type}` : `${auction.bids[0].amount + config.auction[auction.item.type].raise} ${auction.item.type}` },
                    { name: 'Bids', value: `\`\`\`${auction.bids.length == 0 ? '​' : auction.bids.slice(0, 15).map(a => `${a.user}: ${a.amount} ${auction.item.type}`).join('\n')}${auction.bids.length > 10 ? '\n...' : ''}\`\`\`` },
                    { name: 'Winner', value: `${winner.user} (${winner.amount} ${auction.item.type})` }
                )
                .setFooter({ text: `Closed by ${author.username}` })
                .setTimestamp();
            await auctions[item][auction.item.type].message.edit({ embeds: [logEmbed], components: [] });
            delete auctions[item];
        }

        try {
            fs.writeFileSync('./auctions.json', JSON.stringify(auctions, '', '  '));
        } catch (err) {
            console.log('Error saving auctions:', err);
        }
    }
}
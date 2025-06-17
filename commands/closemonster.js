const fs = require('fs');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { errorEmbed } = require('../commonFunctions.js');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('closemonster')
    .setDescription('closes an auction on a monster')
    .addStringOption(option =>
        option.setName('monster')
            .setDescription('the monster to close bidding on')
            .setRequired(true)
            .setAutocomplete(true)
    ),
    async autocomplete(interaction, client, supabase, dkpSheet, pppSheet, tallySheet, auctions, itemList, auctionList, userList) {
        const focusedValue = interaction.options.getFocused(true);
        await interaction.respond(auctionList.filter(a => a.item.monster.toLowerCase().includes(focusedValue.value.toLowerCase())).filter((a, i, arr) => !arr.slice(0, i).map(a => a.item.monster).includes(a.item.monster) && auctions[a.item.monster] != null).map(a => ({ name: a.item.monster, value: a.item.monster })).slice(0, 25));
    },
    async execute(interaction, client, author, supabase, dkpSheet, pppSheet, tallySheet, auctions, dkpChannel, pppChannel, googleSheets) {
        await interaction.deferReply({ ephemeral: true });
        let monster = interaction.options.getString('monster');

        let { data: auctionList, error } = await supabase.from('auctions').select('bids, item!inner(name, type, monster)').eq('item.monster', monster).eq('open', true);
        if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Fetching Monster', error.message)] });

        if (auctionList.length == 0) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription(`There are no open auctions for **${monster}**.`);
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }

        let frozen = 0;
        // let embeds = [];
        let closed = [];
        for (const auction of auctionList) {
            if (auctions[auction.item.name]) continue;
            if (auction.item.type == 'DKP' && author.frozen) {
                frozen++;
                // const errorEmbed = new EmbedBuilder()
                //     .setColor('#ff0000')
                //     .setTitle('Account Frozen')
                //     .setDescription('Your account is frozen. You cannot manage auctions or place bids on DKP items this time.');
                // await interaction.editReply({ embeds: [errorEmbed] });
                // return;
                // embeds.push(errorEmbed);
                continue;
            }

            ({ error } = await supabase.from('auctions').update({
                open: false,
                end: 'now()',
                winner: auction.bids.length == 0 ? null : auction.bids.filter(a => a.amount == auction.bids[auction.bids.length - 1].amount).map(a => a.user).join(', '),
                price: auction.bids.length == 0 ? null : auction.bids[auction.bids.length - 1].amount,
                closer: author.username
            }).eq('item', auction.item.name).eq('open', true));
            if (auction.bids.length > 0) {
                await googleSheets.spreadsheets.values.append({
                    spreadsheetId: config.google[auction.item.type].id,
                    range: config.google[auction.item.type].log,
                    valueInputOption: 'RAW',
                    resource: {
                        values: [
                            [
                                auction.bids.filter(a => a.amount == auction.bids[auction.bids.length - 1].amount).map(a => a.user).join(', '),
                                auction.item.name,
                                auction.item.monster,
                                `${auction.bids[auction.bids.length - 1].amount} ${auction.item.type.toLowerCase() == 'dkp' ? 'dkp' : 'PPP'}`,
                                new Date().toLocaleString()
                            ]
                        ]
                    }
                });
            }

            if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Closing Auction', error.message)] });
            let newEmbed;
            if (auction.bids.length == 0) {
                newEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle(`Auction Closed for ${auction.item.name}`)
                    .setDescription(`Bidding has been closed for **${monster}**.\nNo bids were placed.`)
            } else if (auction.item.type == 'DKP') {
                let winners = auction.bids.sort((a, b) => b.amount - a.amount).filter(a => a.amount === auction.bids[0].amount);
                newEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle(`Auction Closed for ${auction.item.name}`)
                    .setDescription(`Bidding has been closed for **${monster}**.\nWinners (${winners[0].amount} ${auction.item.type}): ${winners.map(a => a.user).join(', ')}`)
            } else {
                winner = auction.bids.sort((a, b) => b.amount - a.amount)[0];
                newEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle(`Auction Closed for ${auction.item.name}`)
                    .setDescription(`Bidding has been closed for **${monster}**.\nWinner: ${winner.user} (${winner.amount} ${auction.item.type})`)
            }
            // await interaction.editReply({ embeds: [newEmbed] });
            // embeds.push(newEmbed);

            closed.push(auction);
        }
        const newEmbed = new EmbedBuilder()
            .setColor(closed.length > 0 ? '#00ff00' : '#ff0000')
            .setDescription(`Closed ${closed.length} item${closed.length == 1 ? '' : 's'}${frozen > 0 ? `\n**Warning:** ${frozen} item${frozen == 1 ? '' : 's'} couldn't be closed due to your account being frozen.` : ''}`);
        await interaction.editReply({ embeds: [newEmbed] });

        if (auctionList.length > 0 && auctions[monster]) {
            if (auctions[monster].DKP) {
                let newEmbed = auctions[monster].DKP.embed;
                if (newEmbed.data) newEmbed = newEmbed.data;
                newEmbed.title = `Auction for ${monster} (Closed)`;
                newEmbed.footer = { text: `Closed by ${author.username}` };
                auctions[monster].DKP.embed = newEmbed;
                await auctions[monster].DKP.message.edit({ embeds: [newEmbed] });
            }
            if (auctions[monster].PPP) {
                let newEmbed = auctions[monster].PPP.embed;
                if (newEmbed.data) newEmbed = newEmbed.data;
                newEmbed.title = `Auction for ${monster} (Closed)`;
                newEmbed.footer = { text: `Closed by ${author.username}` };
                auctions[monster].PPP.embed = newEmbed;
                await auctions[monster].PPP.message.edit({ embeds: [newEmbed] });
            }
            delete auctions[monster];
        }
        try {
            fs.writeFileSync('./auctions.json', JSON.stringify(auctions, '', '  '));
        } catch (err) {
            console.log('Error saving auctions:', err);
        }
    }
}
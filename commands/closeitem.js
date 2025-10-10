const fs = require('fs');
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { errorEmbed } = require('../commonFunctions.js');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('closeitem'),
    async autocomplete(interaction, client, supabase, dkpSheet, pppSheet, tallySheet, auctions, itemList, auctionList, userList) {
        const focusedValue = interaction.options.getFocused(true);
        await interaction.respond(auctionList.filter(a => a.item.name.toLowerCase().includes(focusedValue.value.toLowerCase()) && auctions[a.item.monster] == null).map(a => ({ name: a.item.name, value: a.item.name })).sort((a, b) => a.name > b.name ? 1 : -1).slice(0, 25));
    },
    async buttonHandler(interaction, author, supabase, auctions, dkpChannel, pppChannel, rollChannel, googleSheets, itemList, client) {
        let item = interaction.customId.split('-')[1];
        let confirmed = interaction.customId.split('-')[2] == 'true';
        if (!confirmed) {
            let confirmEmbed = new EmbedBuilder()
                .setColor('#ffff00')
                .setTitle('Confirmation')
                .setDescription(`Are you sure you want to close ${item}?`)
            let buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`closeitem-${item}-true`)
                        .setLabel('✓')
                        .setStyle(ButtonStyle.Success)
                )
            await interaction.reply({ embeds: [confirmEmbed], components: [buttons], ephemeral: true });
            return;
        }
        interaction.message.components[0].components[0].data.disabled = true;
        await interaction.update({ components: interaction.message.components });

        await new Promise(res => client.commands.get('bid').blockBid(item, res));

        let { data: auction, error } = await supabase.from(config.supabase.tables.auctions).select('id, bids, item (name, type, monster), start').eq('item', item).eq('open', true).limit(1);
        if (error) return await interaction.followUp({ content: '', embeds: [errorEmbed('Error Fetching Auction', error.message)] });
        auction = auction[0];

        if (auction == null || auctions[auction.item.monster] != null) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription(`There are no open auctions for **${item}**.`);
            await interaction.followUp({ embeds: [errorEmbed] });
            
            if (auctions[item]?.[auction?.item?.type]) {
                auction.bids.sort((a, b) => b.amount - a.amount);
                let oldEmbed = auctions[item][auction.item.type].embed;
                if (oldEmbed.data) oldEmbed = oldEmbed.data;
                let minutes = Math.floor((Date.now() - new Date(oldEmbed.timestamp).getTime()) / 60000);
                const logEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle(`Auction for ${auction.item.name} (Closed)`)
                    .setDescription(`### Opened <t:${Math.floor(new Date(auction.start).getTime() / 1000)}:R>`)
                    .setAuthor({ name: 'Heirloom\'s Auction Bot', iconURL: 'https://mrqccdyyotqulqmagkhm.supabase.co/storage/v1/object/public/images//profile.png' })
                    .setThumbnail(`https://mrqccdyyotqulqmagkhm.supabase.co/storage/v1/object/public/images//${auction.item.monster.split('(')[0].replaceAll(' ', '')}.png`)
                    .addFields(
                        { name: 'Next Bid', value: auction.bids.length == 0 ? `${config.auction[auction.item.type].min} ${auction.item.type}` : `${Math.round((auction.bids[0].amount + config.auction[auction.item.type].raise) * 10) / 10} ${auction.item.type}` },
                        { name: 'Bids', value: `\`\`\`${auction.bids.length == 0 ? '​' : auction.bids.slice(0, 15).map(a => `${a.user}: ${a.amount} ${auction.item.type}`).join('\n')}${auction.bids.length > 10 ? '\n...' : ''}\`\`\`` }
                    )
                    .setFooter({ text: `Closed by ${author.username}, lasted ${minutes} minute${minutes == 1 ? '' : 's'}` })
                    .setTimestamp(new Date());
                await auctions[item][auction.item.type].message.edit({ embeds: [logEmbed], components: [] });
                delete auctions[item];
            }

            return;
        }

        if (author.frozen) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Account Frozen')
                .setDescription('Your account is frozen. You cannot manage auctions or place bids on items this time.');
            await interaction.followUp({ embeds: [errorEmbed] });
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
        if (error) return await interaction.followUp({ content: '', embeds: [errorEmbed('Error Closing Auction', error.message)] });
        
        if (winner) {
            ({ error } = await supabase.from(config.supabase.tables[auction.item.type].lootHistory).insert({
                user: winner.user,
                item: auction.item.name,
                points_spent: winner.amount,
                auction: auction.id
            }));
            if (error) return await interaction.followUp({ content: '', embeds: [errorEmbed('Error Updating Loot History', error.message)] });
        }

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

        if (auctions[item]?.[auction.item.type]) {
            auction.bids.sort((a, b) => b.amount - a.amount);
            let oldEmbed = auctions[item][auction.item.type].embed;
            if (oldEmbed.data) oldEmbed = oldEmbed.data;
            let minutes = Math.floor((Date.now() - new Date(oldEmbed.timestamp).getTime()) / 60000);
            const logEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`Auction for ${auction.item.name} (Closed)`)
                .setDescription(`### Opened <t:${Math.floor(new Date(auction.start).getTime() / 1000)}:R>`)
                .setAuthor({ name: 'Heirloom\'s Auction Bot', iconURL: 'https://mrqccdyyotqulqmagkhm.supabase.co/storage/v1/object/public/images//profile.png' })
                .setThumbnail(`https://mrqccdyyotqulqmagkhm.supabase.co/storage/v1/object/public/images//${auction.item.monster.split('(')[0].replaceAll(' ', '')}.png`)
                .addFields(
                    { name: 'Next Bid', value: auction.bids.length == 0 ? `${config.auction[auction.item.type].min} ${auction.item.type}` : `${Math.round((auction.bids[0].amount + config.auction[auction.item.type].raise) * 10) / 10} ${auction.item.type}` },
                    { name: 'Bids', value: `\`\`\`${auction.bids.length == 0 ? '​' : auction.bids.slice(0, 15).map(a => `${a.user}: ${a.amount} ${auction.item.type}`).join('\n')}${auction.bids.length > 10 ? '\n...' : ''}\`\`\`` }
                )
                .setFooter({ text: `Closed by ${author.username}, lasted ${minutes} minute${minutes == 1 ? '' : 's'}` })
                .setTimestamp(new Date());
            if (winner) logEmbed.addFields({ name: 'Winner', value: `${winner.user} (${winner.amount} ${auction.item.type})` })
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
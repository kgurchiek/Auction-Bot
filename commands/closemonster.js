const fs = require('fs');
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { errorEmbed } = require('../commonFunctions.js');
const config = require('../config.json');
const { ephemeral } = require('./openmonster.js');

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
    async buttonHandler(interaction, author, supabase, auctions, dkpChannel, pppChannel, rollChannel, googleSheets, itemList) {
        let monster = interaction.customId.split('-')[1];
        let confirmed = interaction.customId.split('-')[2] == 'true';
        if (!confirmed) {
            let confirmEmbed = new EmbedBuilder()
                .setColor('#ffff00')
                .setTitle('Confirmation')
                .setDescription(`Are you sure you want to close all Rare/Ex items from ${monster}?`)
            let buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`closemonster-${monster}-true`)
                        .setLabel('✓')
                        .setStyle(ButtonStyle.Success)
                )
            await interaction.reply({ embeds: [confirmEmbed], components: [buttons], ephemeral: true });
            return;
        }
        interaction.message.components[0].components[0].data.disabled = true;
        await interaction.update({ components: interaction.message.components });

        let { data: auctionList, error } = await supabase.from(config.supabase.tables.auctions).select('id, bids, item!inner(name, type, monster, tradeable), start').eq('item.monster', monster).eq('open', true);
        if (error) return await interaction.followUp({ content: '', embeds: [errorEmbed('Error Fetching Monster', error.message)] });

        if (auctionList.length == 0) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription(`There are no open auctions for **${monster}**.`);
            await interaction.followUp({ embeds: [errorEmbed] });

            if (auctions[monster]) {
                if (auctions[monster].DKP) {
                    let newEmbed = auctions[monster].DKP.embed;
                    if (newEmbed.data) newEmbed = newEmbed.data;
                    newEmbed.title = `Auction for ${monster} (Closed)`;
                    let minutes = Math.floor((Date.now() - new Date(newEmbed.timestamp).getTime()) / 60000);
                    newEmbed.footer = { text: `Closed by ${author.username}, lasted ${minutes} minute${minutes == 1 ? '' : 's'}` };
                    newEmbed.timestamp = new Date().toISOString();
                    await auctions[monster].DKP.message.edit({ embeds: [newEmbed], components: [] });
                }
                if (auctions[monster].PPP) {
                    let newEmbed = auctions[monster].PPP.embed;
                    if (newEmbed.data) newEmbed = newEmbed.data;
                    newEmbed.title = `Auction for ${monster} (Closed)`;
                    let minutes = Math.floor((Date.now() - new Date(newEmbed.timestamp).getTime()) / 60000);
                    newEmbed.footer = { text: `Closed by ${author.username}, lasted ${minutes} minute${minutes == 1 ? '' : 's'}` };
                    newEmbed.timestamp = new Date().toISOString();
                    await auctions[monster].PPP.message.edit({ embeds: [newEmbed], components: [] });
                }
                delete auctions[monster];
            }
            
            return;
        }

        // let embeds = [];
        let closed = [];
        for (const auction of auctionList) {
            if (auction.item.tradeable) continue;
            if (author.frozen) {
                // const errorEmbed = new EmbedBuilder()
                //     .setColor('#ff0000')
                //     .setTitle('Account Frozen')
                //     .setDescription('Your account is frozen. You cannot manage auctions or place bids on items this time.');
                // await interaction.followUp({ embeds: [errorEmbed] });
                // return;
                // embeds.push(errorEmbed);
                continue;
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

            // let newEmbed;
            // if (auction.bids.length == 0) {
            //     newEmbed = new EmbedBuilder()
            //         .setColor('#00ff00')
            //         .setTitle(`Auction Closed for ${auction.item.name}`)
            //         .setDescription(`Bidding has been closed for **${monster}**.\nNo bids were placed.`)
            // } else if (auction.item.type == 'DKP') {
            //     let winners = auction.bids.sort((a, b) => b.amount - a.amount).filter(a => a.amount === auction.bids[0].amount);
            //     newEmbed = new EmbedBuilder()
            //         .setColor('#00ff00')
            //         .setTitle(`Auction Closed for ${auction.item.name}`)
            //         .setDescription(`Bidding has been closed for **${monster}**.\nWinners (${winners[0].amount} ${auction.item.type}): ${winners.map(a => a.user).join(', ')}`)
            // } else {
            //     winner = auction.bids.sort((a, b) => b.amount - a.amount)[0];
            //     newEmbed = new EmbedBuilder()
            //         .setColor('#00ff00')
            //         .setTitle(`Auction Closed for ${auction.item.name}`)
            //         .setDescription(`Bidding has been closed for **${monster}**.\nWinner: ${winner.user} (${winner.amount} ${auction.item.type})`)
            // }
            // await interaction.followUp({ embeds: [newEmbed] });
            // embeds.push(newEmbed);

            if (auctions[auction.item.name]?.[auction.item.type]) {
                let oldEmbed = auctions[auction.item.name][auction.item.type].embed;
                if (oldEmbed.data) oldEmbed = oldEmbed.data;
                let minutes = Math.floor((Date.now() - new Date(oldEmbed.timestamp).getTime()) / 60000);
                auction.bids.sort((a, b) => b.amount - a.amount);
                const logEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle(`Auction for ${auction.item.name} (Closed)`)
                    .setDescription(`### Opened <t:${Math.floor(new Date(auction.start).getTime() / 1000)}:R>`)
                    .setAuthor({ name: 'Heirloom\'s Auction Bot', iconURL: 'https://mrqccdyyotqulqmagkhm.supabase.co/storage/v1/object/public/images//profile.png' })
                    .setThumbnail(`https://mrqccdyyotqulqmagkhm.supabase.co/storage/v1/object/public/images//${monster.split('(')[0].replaceAll(' ', '')}.png`)
                    .addFields(
                        { name: 'Next Bid', value: auction.bids.length == 0 ? `${config.auction[auction.item.type].min} ${auction.item.type}` : `${Math.round((auction.bids[0].amount + config.auction[auction.item.type].raise) * 10) / 10} ${auction.item.type}` },
                        { name: 'Bids', value: `\`\`\`${auction.bids.length == 0 ? '​' : auction.bids.slice(0, 15).map(a => `${a.user}: ${a.amount} ${auction.item.type}`).join('\n')}${auction.bids.length > 10 ? '\n...' : ''}\`\`\`` }
                    )
                    .setFooter({ text: `Closed by ${author.username}, lasted ${minutes} minute${minutes == 1 ? '' : 's'}` })
                    .setTimestamp(new Date());
                await auctions[auction.item.name][auction.item.type].message.edit({ embeds: [logEmbed], components: [] });
                delete auctions[auction.item.name];
            }

            closed.push(auction);
        }

        if (auctionList.length > 0 && auctions[monster]) {
            let types = ['DKP', 'PPP'].filter(a => auctions[monster][a] != null);
            for (let type of types) {
                if (closed.filter(a => a.item.type == type).length == auctionList.filter(a => a.item.type == type).length) {
                    let newEmbed = auctions[monster][type].embed;
                    if (newEmbed.data) newEmbed = newEmbed.data;
                    newEmbed.title = `Auction for ${monster} (Closed)`;
                    let minutes = Math.floor((Date.now() - new Date(newEmbed.timestamp).getTime()) / 60000);
                    newEmbed.footer = { text: `Closed by ${author.username}, lasted ${minutes} minute${minutes == 1 ? '' : 's'}` };
                    newEmbed.timestamp = new Date().toISOString();
                    await auctions[monster][type].message.edit({ embeds: [newEmbed], components: [] });
                } else {
                    let newEmbed = auctions[monster][type].embed;
                    if (newEmbed.data) newEmbed = newEmbed.data;
                    let newButtons = auctions[monster][type].buttons;
                    newButtons[0].components[0].options = newButtons[0].components[0].options.filter(a => (a.data || a).value.split('-')[1] == 'true');
                    newButtons[1].components = newButtons[1].components.filter(a => (a.data || a).custom_id.split('-')[0] != 'closemonster');
                    for (let field of newEmbed.fields) {
                        if (field.name.endsWith('(Closed)')) continue;
                        let item = itemList.find(a => field.name.startsWith(`${a.tradeable ? '💰 ' : ''}**[${a.name}]**`));
                        if (item == null || item.tradeable) continue;
                        field.name = `${field.name} (Closed)`;
                    }
                    auctions[monster][type].embed = newEmbed;
                    auctions[monster][type].buttons = newButtons;
                    await auctions[monster][type].message.edit({ embeds: [newEmbed], components: newButtons });
                }
            }
        }
        try {
            fs.writeFileSync('./auctions.json', JSON.stringify(auctions, '', '  '));
        } catch (err) {
            console.log('Error saving auctions:', err);
        }
    }
}
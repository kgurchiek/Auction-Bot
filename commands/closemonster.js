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
    ephemeral: true,
    async execute(interaction, client, author, supabase, dkpSheet, pppSheet, tallySheet, auctions, dkpChannel, pppChannel, rollChannel, googleSheets, updateSheets, itemList) {
        let monster = interaction.options.getString('monster');

        let { data: auctionList, error } = await supabase.from(config.supabase.tables.auctions).select('bids, item!inner(name, type, monster, tradeable)').eq('item.monster', monster).eq('open', true);
        if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Fetching Monster', error.message)] });

        if (auctionList.length == 0) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription(`There are no open auctions for **${monster}**.`);
            await interaction.editReply({ embeds: [errorEmbed] });

            if (auctions[monster]) {
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
            
            return;
        }

        let frozen = 0;
        // let embeds = [];
        let closed = [];
        for (const auction of auctionList) {
            if (auction.item.tradeable) continue;
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

            let winners = auction.bids.filter(a => a.amount == auction.bids[auction.bids.length - 1].amount);
            let winner;
            if (winners.length > 1) {
                let rollEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle(`Rolls for ${auction.item.name}`);
                let message = await rollChannel.send({ embeds: [rollEmbed] });
                for (let item of winners) {
                    await message.edit({ embeds: [rollEmbed] });
                    do {
                        item.roll = Math.floor(Math.random() * 1000)
                    } while (winners.filter(a => a.roll == item.roll).length > 1);
                    rollEmbed.data.description = `${rollEmbed.data.description || ''}\n${item.user}: ${item.roll}`.trim();
                    await message.edit({ embeds: [rollEmbed] });
                }
                winner = winners.sort((a, b) => b.roll - a.roll)[0];
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

            if (auctions[auction.item.name]?.[auction.item.type]) {
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
                await auctions[auction.item.name][auction.item.type].message.edit({ embeds: [logEmbed] });
                delete auctions[auction.item.name];
            }

            closed.push(auction);
        }
        const newEmbed = new EmbedBuilder()
            .setColor(closed.length > 0 ? '#00ff00' : '#ff0000')
            .setDescription(`Closed ${closed.length} item${closed.length == 1 ? '' : 's'}${frozen > 0 ? `\n**Warning:** ${frozen} item${frozen == 1 ? '' : 's'} couldn't be closed due to your account being frozen.` : ''}`);
        await interaction.editReply({ embeds: [newEmbed] });

        if (auctionList.length > 0 && auctions[monster]) {
            if (closed.length == auctionList.length) {
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
            } else {
                if (auctions[monster].DKP) {
                    let newEmbed = auctions[monster].DKP.embed;
                    if (newEmbed.data) newEmbed = newEmbed.data;
                    let newButtons = auctions[monster].DKP.buttons;
                    newButtons.components[0].options = newButtons.components[0].options.filter(a => a.data.value.split('-')[1] == 'true');
                    for (let field of newEmbed.fields) {
                        if (field.name.endsWith('(Closed)')) continue;
                        let item = itemList.find(a => field.name.startsWith(`${a.tradeable ? '💰 ' : ''}**[${a.name}]**`));
                        if (item == null || item.tradeable) continue;
                        field.name = `${field.name} (Closed)`;
                    }
                    auctions[monster].DKP.embed = newEmbed;
                    auctions[monster].DKP.buttons = newButtons;
                    await auctions[monster].DKP.message.edit({ embeds: [newEmbed], components: [newButtons] });
                }
                if (auctions[monster].PPP) {
                    let newEmbed = auctions[monster].PPP.embed;
                    if (newEmbed.data) newEmbed = newEmbed.data;
                    let newButtons = auctions[monster].PPP.buttons;
                    newButtons.components[0].options = newButtons.components[0].options.filter(a => a.data.value.split('-')[1] == 'true');
                    for (let field of newEmbed.fields) {
                        if (field.name.endsWith('(Closed)')) continue;
                        let item = itemList.find(a => field.name.startsWith(`${a.tradeable ? '💰 ' : ''}**[${a.name}]**`));
                        if (item == null || item.tradeable) continue;
                        field.name = `${field.name} (Closed)`;
                    }
                    auctions[monster].PPP.embed = newEmbed;
                    auctions[monster].PPP.buttons = newButtons;
                    await auctions[monster].PPP.message.edit({ embeds: [newEmbed], components: [newButtons] });
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
const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const config = require('../config.json');
const { errorEmbed } = require('../commonFunctions.js');

let bidQueue = [];
let blockedBids = [];
const blockBid = (item, callback) => blockedBids.push({ item, callback });
const unblockBid = (item) => blockedBids = blockedBids.filter(a => a.item != item);
const handleQueue = async () => {
    console.log({blockedBids})
    for (let bid of blockedBids) if (bidQueue.find(a => a.item == bid.item) == null) bid.callback();
    for (const bid of bidQueue) await bid.func();
    bidQueue.length = 0;
    setTimeout(handleQueue, 0);
}
handleQueue();

module.exports = {
  blockBid,
  unblockBid,
  data: new SlashCommandBuilder()
    .setName('bid'),
    async buttonHandler(interaction, author) {
        const modal = new ModalBuilder()
            .setCustomId(`bid-${interaction.customId.split('-')[1]}`)
            .setTitle(interaction.customId.split('-')[1])
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                    .setCustomId('amount')
                    .setLabel(`Your balance: ${author.dkp} DKP, ${author.ppp} PPP`)
                    .setStyle(TextInputStyle.Short)
                )
            );
        interaction.showModal(modal);
    },
    async selectHandler(interaction, author, auctions) {
        const [item, tradeable, type, monster] = interaction.values[0].split('-');
        const modal = new ModalBuilder()
            .setCustomId(`bid-${item}`)
            .setTitle(item)
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                    .setCustomId('amount')
                    .setLabel(`Your balance: ${author.dkp} DKP, ${author.ppp} PPP`)
                    .setStyle(TextInputStyle.Short)
                )
            );
        if (auctions[monster]?.[type]) await auctions[monster][type].message.edit({ embeds: [auctions[monster][type].embed] });
        await interaction.showModal(modal);
    },
    async modalHandler(interaction, author, supabase, auctions) {
        let item = interaction.customId.split('-')[1];
        if (item.endsWith('DKP)') || item.endsWith('PPP)')) item = item.slice(0, item.lastIndexOf('(') - 1);
        
        await interaction.deferReply({ ephemeral: true });
        
        let amount = interaction.fields.getTextInputValue('amount');
        if (isNaN(parseFloat(amount))) {
            let errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription(`"${amount}" is not a number.`)
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }
        amount = parseFloat(amount);

        bidQueue.push({
            item,
            func: async () => {
                let { data: auction, error } = await supabase.from(config.supabase.tables.auctions).select('id, item!inner(name, type, monster, wipe, tradeable), bids, host, start').eq('item.name', item).eq('open', true).limit(1);
                if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Fetching Auction', error.message)] });
                auction = auction[0];
                if (blockedBids.find(a => a.item == item) || auction == null) {
                    const errorEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('Error')
                        .setDescription(`There are no open auctions for **${item}**.`);
                    await interaction.editReply({ embeds: [errorEmbed] });
                    return;
                }

                if (auction.item.type == 'DKP' && author.frozen) {
                    const errorEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('Account Frozen')
                        .setDescription('Your account is frozen. You cannot manage auctions or place bids on DKP items this time.');
                    await interaction.editReply({ embeds: [errorEmbed] });
                    return;
                }

                if (auction.bids.find(a => a.user == author.username && a.amount == amount)) {
                    const errorEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('Duplicate Bid')
                        .setDescription(`You have already placed a bid of **${amount} ${auction.item.type}** on **${auction.item.name}**.`);
                    await interaction.editReply({ embeds: [errorEmbed] });
                    return;
                }

                let userBids;
                ({ data: userBids, error } = await supabase.from(config.supabase.tables.auctions).select('id, bids, item!inner(name, type, monster, tradeable), winner, price, host, start').eq('open', true).eq('item.type', auction.item.type).neq('item.name', auction.item.name).like('winner', `%${author.username}%`));
                if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Fetching User\'s Bids', error.message)] });
                userBids = userBids.filter(a => a.winner.split(', ').includes(author.username));
                let cost = userBids.reduce((a, b) => a + b.price, 0);
                if (auction.item.wipe) {
                    for (let auction of userBids) {
                        auction.bids = auction.bids.filter(a => a.user != author.username);
                        while (true) {
                            if (auction.bids.length == 0) break;
                            let { data: newWinner, error } = await supabase.from(config.supabase.tables.users).select('id::text, username, dkp, ppp').eq('username', auction.bids[auction.bids.length - 1].user);
                            if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error fetching new winner', error.message)] });
                            newWinner = newWinner[0];
                            ({ data: userBids, error } = await supabase.from(config.supabase.tables.auctions).select('id, bids, item!inner(name, type, monster), winner, price, host').eq('open', true).eq('item.type', auction.item.type).like('winner', `%${newWinner.username}%`));
                            if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error fetching new winner\'s bids:', error.message)] });
                            userBids = userBids.filter(a => a.winner.split(', ').includes(newWinner.username));
                            let cost = userBids.reduce((a, b) => a + b.price, 0) + auction.bids[auction.bids.length - 1].amount;
                            if (cost > newWinner[auction.item.type.toLowerCase()]) auction.bids = auction.bids.slice(0, auction.bids.length - 1);
                            else break;
                        }
                        ({ data: bids, error } = await supabase.from(config.supabase.tables.auctions).update({
                            bids: auction.bids,
                            winner: auction.bids.length == 0 ? null : auction.bids.filter(a => a.amount == auction.bids[auction.bids.length - 1].amount).map(a => a.user).join(', '),
                            price: auction.bids.length == 0 ? null : auction.bids[auction.bids.length - 1].amount
                        }).eq('id', auction.id));
                        if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Deleting User\'s Bids', error.message)] });
                        auction.bids.sort((a, b) => b.amount - a.amount);
                        if (auctions[auction.item.name]) {
                            const logEmbed = new EmbedBuilder()
                                .setColor('#00ff00')
                                .setTitle(`Auction for ${auction.item.name} (Open)`)
                                .setDescription(`### Opened <t:${Math.floor(new Date(auction.start).getTime() / 1000)}:R>`)
                                .setAuthor({ name: 'Heirloom\'s Auction Bot', iconURL: 'https://mrqccdyyotqulqmagkhm.supabase.co/storage/v1/object/public/images//profile.png' })
                                .setThumbnail(`https://mrqccdyyotqulqmagkhm.supabase.co/storage/v1/object/public/images//${auction.item.monster.split('(')[0].replaceAll(' ', '')}.png`)
                                .addFields(
                                    { name: 'Next Bid', value: `${auction.bids.length == 0 ? 0 : Math.round((auction.bids[0].amount + config.auction[auction.item.type].raise) * 10) / 10} ${auction.item.type}` },
                                    { name: 'Bids', value: `\`\`\`${auction.bids.length == 0 ? '​' : auction.bids.slice(0, 15).map(a => `${a.user}: ${a.amount} ${auction.item.type}`).join('\n')}${auction.bids.length > 10 ? '\n...' : ''}\`\`\`` }
                                )
                                .setFooter({ text: `Opened by ${auction.host}` })
                                .setTimestamp();
                            auctions[auction.item.name][auction.item.type].embed = logEmbed;
                            await auctions[auction.item.name][auction.item.type].message.edit({ embeds: [logEmbed] });
                        }
                        if (auctions[auction.item.monster]) {
                            let newEmbed = auctions[auction.item.monster][auction.item.type].embed;
                            if (newEmbed.data) newEmbed = newEmbed.data;
                            let highestBids = auction.bids.filter(a => a.amount == auction.bids[0].amount);
                            let field = newEmbed.fields.findIndex(a => a.name.startsWith(`${auction.item.tradeable ? '💰 ' : ''}**[${auction.item.name}]**`));
                            if (field != -1) {
                                newEmbed.fields[field].name = `${auction.item.tradeable ? '💰 ' : ''}**[${auction.item.name}]** __${highestBids.length == 0 ? '*No Bids*' : `*Current Bid: **(${highestBids[0].amount} ${auction.item.type})***`}__`;
                                let value = '';
                                for (let i = 0; i == 0 || value.length > 1024; i++) value = highestBids.length == 0 ? '​' : `**Highest Bid${highestBids.length == 1 ? '' : 's'}:**\n🥇${highestBids.map(a => a.user).slice(0, highestBids.length - i).join(', ')}${i == 0 ? '' : ', ...'} (${highestBids[0].amount} ${auction.item.type})`;
                                newEmbed.fields[field].value = value;
                                auctions[auction.item.monster][auction.item.type].embed = newEmbed;
                                await auctions[auction.item.monster][auction.item.type].message.edit({ embeds: [newEmbed] });
                            }
                        }
                    }
                    amount = author[auction.item.type.toLowerCase()];
                }

                let { increment, raise, winRaise } = config.auction[auction.item.type];
                if (Math.round((author[auction.item.type.toLowerCase()] - (auction.item.wipe ? 0 : cost)) / increment) * increment < amount) {
                    const errorEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('Insufficient Funds')
                        .setDescription(`You only have **${author[auction.item.type.toLowerCase()] - cost} ${auction.item.type}** left to bid on ${auction.item.name}${cost == 0 ? '' : ` (You're currently spending **${cost} ${auction.item.type}** on ${userBids.length} auction${userBids.length == 1 ? '' : 's'})`}.`);
                    await interaction.editReply({ embeds: [errorEmbed] });
                    return;
                }

                if (auction.item.wipe) raise = increment;
                if (Math.abs(Math.round((amount % increment) * 10) - ((amount % increment) * 10)) > 0.00001) {
                    const errorEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('Invalid Bid Amount')
                        .setDescription(`${auction.item.type} bids must be in increments of **${increment}**.`);
                    await interaction.editReply({ embeds: [errorEmbed] });
                    return;
                }
                
                if (auction.bids.length > 0 && amount < Math.round((auction.bids[auction.bids.length - 1].amount + raise) * 10) / 10 && !(amount >= auction.bids[auction.bids.length - 1].amount + winRaise && amount == author[auction.item.type.toLowerCase()])) {
                    const errorEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('Bid Too Low')
                        .setDescription(`You must bid at least **${Math.round((auction.bids[auction.bids.length - 1].amount + raise) * 10) / 10} ${auction.item.type}** to outbid the current highest bidder.`);
                    await interaction.editReply({ embeds: [errorEmbed] });
                    return;
                }

                if (auction.bids.length > 0 && amount == auction.bids[auction.bids.length - 1].amount && auction.item.tradeable) {
                    const errorEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('Bid Too Low')
                        .setDescription(`You can't tie on a tradeable item.`);
                    await interaction.editReply({ embeds: [errorEmbed] });
                    return;
                }

                auction.bids.push({ user: author.username, amount, wipe: amount == author[auction.item.type.toLowerCase()] });
                ({ error } = await supabase.from(config.supabase.tables.auctions).update({
                    bids: auction.bids,
                    winner: auction.bids.filter(a => a.amount == amount).map(a => a.user).join(', '),
                    price: amount
                }).eq('id', auction.id));
                if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Placing Bid', error.message)] });
                // const newEmbed = new EmbedBuilder()
                //     .setColor('#00ff00')
                //     .setTitle('Bid Placed')
                //     .setDescription(`You have placed a bid of **${amount}** on **${auction.item.name}**.`);
                await interaction.editReply('​');
                await interaction.deleteReply();

                auction.bids.sort((a, b) => b.amount - a.amount);
                if (auctions[item]) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle(`Auction for ${auction.item.name} (Open)`)
                        .setDescription(`### Opened <t:${Math.floor(new Date(auction.start).getTime() / 1000)}:R>`)
                        .setAuthor({ name: 'Heirloom\'s Auction Bot', iconURL: 'https://mrqccdyyotqulqmagkhm.supabase.co/storage/v1/object/public/images//profile.png' })
                        .setThumbnail(`https://mrqccdyyotqulqmagkhm.supabase.co/storage/v1/object/public/images//${auction.item.monster.split('(')[0].replaceAll(' ', '')}.png`)
                        .addFields(
                            { name: 'Next Bid', value: `${Math.round((auction.bids[0].amount + config.auction[auction.item.type].raise) * 10) / 10} ${auction.item.type}` },
                            { name: 'Bids', value: `\`\`\`${auction.bids.slice(0, 15).map(a => `${a.user}: ${a.amount} ${auction.item.type}`).join('\n')}${auction.bids.length > 10 ? '\n...' : ''}\`\`\`` }
                        )
                        .setFooter({ text: `Opened by ${auction.host}` })
                        .setTimestamp();
                    auctions[item][auction.item.type].embed = logEmbed;
                    await auctions[item][auction.item.type].message.edit({ embeds: [logEmbed] });
                }
                if (auctions[auction.item.monster]) {
                    let newEmbed = auctions[auction.item.monster][auction.item.type].embed;
                    if (newEmbed.data) newEmbed = newEmbed.data;
                    let highestBids = auction.bids.filter(a => a.amount == auction.bids[0].amount);
                    let field = newEmbed.fields.findIndex(a => a.name.startsWith(`${auction.item.tradeable ? '💰 ' : ''}**[${auction.item.name}]**`));
                    if (field != -1) {
                        newEmbed.fields[field].name = `${auction.item.tradeable ? '💰 ' : ''}**[${auction.item.name}]** __${highestBids.length == 0 ? '*No Bids*' : `*Current Bid: **(${highestBids[0].amount} ${auction.item.type})***`}__`;
                        let value = '';
                        for (let i = 0; i == 0 || value.length > 1024; i++) value = highestBids.length == 0 ? '​' : `**Highest Bid${highestBids.length == 1 ? '' : 's'}:**\n🥇${highestBids.map(a => a.user).slice(0, highestBids.length - i).join(', ')}${i == 0 ? '' : ', ...'} (${highestBids[0].amount} ${auction.item.type})`;
                        newEmbed.fields[field].value = value;
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
        });
    }
}
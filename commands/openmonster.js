const fs = require('fs');
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { errorEmbed } = require('../commonFunctions.js');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('openmonster')
    .setDescription('opens an auction on a monster')
    .addStringOption(option =>
        option.setName('monster')
            .setDescription('the monster whose items are to be sold')
            .setRequired(true)
            .setAutocomplete(true)
    ),
    async autocomplete(interaction, client, supabase, dkpSheet, pppSheet, tallySheet, auctions, itemList, auctionList, userList) {
        const focusedValue = interaction.options.getFocused(true);
        let monsters = itemList.map(a => a.monster).filter((a, i, arr) => !arr.slice(0, i).includes(a) && a.toLowerCase().includes(focusedValue.value.toLowerCase()));
        await interaction.respond(monsters.sort((a, b) => a > b ? 1 : -1).map(a => ({ name: a, value: a })).slice(0, 25));
    },
    ephemeral: true,
    async execute(interaction, client, author, supabase, dkpSheet, pppSheet, tallySheet, auctions, dkpChannel, pppChannel, rollChannel, googleSheets, updateSheets, itemList, auctionSheet) {
        const monster = interaction.options.getString('monster');
        
        let { data: items, error } = await supabase.from(config.supabase.tables.items).select('*').eq('monster', monster);
        if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Fetching Monster', error.message)] });

        if (items.length == 0) {
            const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('Error')
            .setDescription(`Monster **${monster}** not found.`);
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }
        
        // let embeds = [];
        let frozen = 0;
        let opened = [];
        for (const item of items) {
            if (author.frozen) {
                frozen++;
                // const errorEmbed = new EmbedBuilder()
                //     .setColor('#ff0000')
                //     .setTitle('Account Frozen')
                //     .setDescription('Your account is frozen. You cannot manage auctions or place bids on items this time.');
                // await interaction.editReply({ embeds: [errorEmbed] });
                // return;
                // embeds.push(errorEmbed);
                continue;
            }
        
            let auction;
            ({ data: auction, error } = await supabase.from(config.supabase.tables.auctions).select('*').eq('item', item.name).eq('open', true).limit(1));
            if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Fetching Auctions', error.message)] });
            auction = auction[0];
            if (auction != null) {
                // const errorEmbed = new EmbedBuilder()
                //     .setColor('#ff0000')
                //     .setTitle('Error')
                //     .setDescription(`Auction for **${item.name}** is already open.`);
                // await interaction.editReply({ embeds: [errorEmbed] });
                // return;
                // embeds.push(errorEmbed);
                continue;
            }
            ({ error } = await supabase.from(config.supabase.tables.auctions).insert({ item: item.name, host: author.username }));
            if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Creating Auction', error.message)] });
            // const newEmbed = new EmbedBuilder()
            //     .setColor('#00ff00')
            //     .setTitle(`Auction Started`)
            //     .setDescription(`Auction for **${item.name}** has been opened.`);
            // await interaction.editReply({ embeds: [newEmbed] });
            // embeds.push(newEmbed);

            opened.push(item);
        }

        const newEmbed = new EmbedBuilder()
            .setColor(opened.length > 0 ? '#00ff00' : '#ff0000')
            .setDescription(`Opened ${opened.length} item${opened.length == 1 ? '' : 's'}${frozen > 0 ? `\n**Warning:** ${frozen} item${frozen == 1 ? '' : 's'} couldn't be opened due to your account being frozen.` : ''}`);
        await interaction.editReply({ content: '', embeds: [newEmbed] });

        if (opened.length == 0) return;
        let auction;
        for (let item of itemList) if (item.monster == monster) client.commands.get('bid').unblockBid(item.name);
        ({ data: auction, error } = await supabase.from(config.supabase.tables.auctions).select('item!inner(name, monster), bids').eq('item.monster', monster).eq('open', true));
        if (error) return await interaction.editReply({ content: '', embeds: [newEmbed, errorEmbed('Error Fetching Auctions', error.message)] });

        let rareex = items.filter(a => !a.tradeable).sort((a, b) => a.name > b.name ? 1 : -1);
        let tradeables = items.filter(a => a.tradeable).sort((a, b) => a.name > b.name ? 1 : -1);
        const dkpEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`Auction for ${monster} (Open)`)
            .setDescription(`### Opened <t:${Math.floor(Date.now() / 1000)}:R>`)
            .setAuthor({ name: 'Heirloom\'s Auction Bot', iconURL: 'https://mrqccdyyotqulqmagkhm.supabase.co/storage/v1/object/public/images//profile.png' })
            .setThumbnail(`https://mrqccdyyotqulqmagkhm.supabase.co/storage/v1/object/public/images//${monster.split('(')[0].replaceAll(' ', '')}.png`)
            .setFooter({ text: `Opened by ${author.username}` })
            .setTimestamp();
        const dkpDropdown = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('bid')
                    .setPlaceholder('Select an item')
                    .addOptions(
                        ...rareex.filter(a => a.type == 'DKP').concat(tradeables.filter(a => a.type == 'DKP')).map(a =>
                            new StringSelectMenuOptionBuilder()
                                .setLabel(a.name)
                                .setValue(`${a.name}-${a.tradeable}-${a.type}-${a.monster}`)
                        )
                    )
            )
        const pppEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`Auction for ${monster} (Open)`)
            .setDescription(`### Opened <t:${Math.floor(Date.now() / 1000)}:R>`)
            .setAuthor({ name: 'Heirloom\'s Auction Bot', iconURL: 'https://mrqccdyyotqulqmagkhm.supabase.co/storage/v1/object/public/images//profile.png' })
            .setThumbnail(`https://mrqccdyyotqulqmagkhm.supabase.co/storage/v1/object/public/images//${monster.split('(')[0].replaceAll(' ', '')}.png`)
            .setFooter({ text: `Opened by ${author.username}` })
            .setTimestamp();
        const pppDropdown = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('bid')
                    .setPlaceholder('Select an item')
                    .addOptions(
                       ...rareex.filter(a => a.type == 'PPP').concat(tradeables.filter(a => a.type == 'PPP')).map(a =>
                            new StringSelectMenuOptionBuilder()
                                .setLabel(a.name)
                                .setValue(`${a.name}-${a.tradeable}-${a.type}-${a.monster}`)
                        )
                    )
            )
        const buttons = new ActionRowBuilder();
        if (rareex.length) {
            buttons.addComponents(
                new ButtonBuilder()
                    .setCustomId(`closemonster-${monster}-false`)
                    .setLabel('Close Rare/Ex')
                    .setStyle(ButtonStyle.Primary)
            )
        }
        buttons.addComponents(
            new ButtonBuilder()
                .setCustomId(`closeall-${monster}-false`)
                .setLabel('Close Everything')
                .setStyle(ButtonStyle.Danger)
        )
        for (let item of rareex.concat(rareex.reduce((a, b) => a.find(c => c.type == b.type) ? a : a.concat({ type: b.type }), []), tradeables)) {
            let embed = item.type == 'DKP' ? dkpEmbed : pppEmbed;
            if (item.name == null) {
                if (rareex.length && tradeables.length) embed.addFields({ name: '​\n——————————————————————————', value: '​' });
                continue;
            }
            let highestBids = auction.find(a => item.name == a.item.name).bids.filter((a, i, arr) => a.amount == arr[arr.length - 1].amount);
            let value = '';
            for (let i = 0; i == 0 || value.length > 1024; i++) value = highestBids.length == 0 ? '​' : `**Highest Bid${highestBids.length == 1 ? '' : 's'}:**\n🥇${highestBids.map(a => a.user).slice(0, highestBids.length - i).join(', ')}${i == 0 ? '' : ', ...'} (${highestBids[0].amount} ${item.type})`;
            embed.addFields({ name: `${item.tradeable ? '💰 ' : ''}**[${item.name}]** __${highestBids.length == 0 ? '*No Bids*' : `*Current Bid: **(${highestBids[0].amount} ${item.type})***`}__`, value });
        }
        auctions[monster] = {}
        try {
            if (items.find(a => a.type == 'DKP')) auctions[monster].DKP = { embed: dkpEmbed, buttons: [dkpDropdown, buttons], message: await dkpChannel.send({ embeds: [dkpEmbed], components: [dkpDropdown, buttons] }) };
            if (items.find(a => a.type == 'PPP')) auctions[monster].PPP = { embed: pppEmbed, buttons: [pppDropdown, buttons], message: await pppChannel.send({ embeds: [pppEmbed], components: [pppDropdown, buttons] }) };
        } catch (err) {
            return await interaction.editReply({ content: '', embeds: [newEmbed, errorEmbed(`Error Sending Auction Message for ${monster}`, error.message)] });
        }
        try {
            fs.writeFileSync('./auctions.json', JSON.stringify(auctions, '', '  '));
        } catch (err) {
            console.log('Error saving auctions:', err);
        }
    }
}
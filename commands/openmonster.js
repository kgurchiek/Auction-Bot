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
    async autocomplete(interaction, client, supabase, auctions, itemList, auctionList, userList) {
        const focusedValue = interaction.options.getFocused(true);
        let monsters = itemList.map(a => a.monster).filter((a, i, arr) => !arr.slice(0, i).includes(a) && a.toLowerCase().includes(focusedValue.value.toLowerCase()));
        await interaction.respond(monsters.sort((a, b) => a > b ? 1 : -1).map(a => ({ name: a, value: a })).slice(0, 25));
    },
    ephemeral: true,
    async execute(interaction, client, author, supabase, auctions, dkpChannel, pppChannel, rollChannel, itemList) {
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
            ({ error } = await supabase.from(config.supabase.tables.auctions).insert({ item: item.name, host: author.username, monster: true }));
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
    }
}
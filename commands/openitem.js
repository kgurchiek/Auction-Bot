const fs = require('fs');
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { errorEmbed } = require('../commonFunctions.js');
const config = require('../config.json');
const { buttonHandler } = require('./bid.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('openitem')
    .setDescription('opens an auction on an item')
    .addStringOption(option =>
        option.setName('item')
            .setDescription('the item to sell')
            .setRequired(true)
            .setAutocomplete(true)
    ),
    async autocomplete(interaction, client, supabase, auctions, itemList, auctionList, userList) {
        const focusedValue = interaction.options.getFocused(true);
        await interaction.respond(itemList.filter(a => a.name.toLowerCase().includes(focusedValue.value.toLowerCase())).map(a => ({ name: a.name, value: a.name })).slice(0, 25));
    },
    ephemeral: true,
    async execute(interaction, client, author, supabase, auctions, dkpChannel, pppChannel) {
        let itemName = interaction.options.getString('item');
        let { data: item, error } = await supabase.from(config.supabase.tables.items).select('*').eq('name', itemName).eq('available', true).limit(1);
        if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Fetching Item', error.message)] });
        item = item[0];

        if (item == null) {
            const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('Error')
            .setDescription(`Item **${itemName}** not found.`);
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }

        if (author.frozen) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Account Frozen')
                .setDescription('Your account is frozen. You cannot manage auctions or place bids on items this time.');
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }
    
        let auction;
        ({ data: auction, error } = await supabase.from(config.supabase.tables.auctions).select('*').eq('item', item.name).eq('open', true).limit(1));
        if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Fetching Auctions', error.message)] });
        auction = auction[0];
        if (auction != null) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription(`Auction for **${item.name}** is already open.`);
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }
        
        client.commands.get('bid').unblockBid(item.name);
        ({ error } = await supabase.from(config.supabase.tables.auctions).insert({ item: item.name, host: author.username, monster: false }));
        if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Creating Auction', error.message)] });
        const newEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`Auction Started`)
            .setDescription(`Auction for **${item.name}** has been opened.`);
        await interaction.editReply({ embeds: [newEmbed] });
    }
}
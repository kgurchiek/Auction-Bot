const fs = require('fs');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { errorEmbed } = require('../commonFunctions.js');
const config = require('../config.json');

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
    async autocomplete(interaction, client, supabase, dkpSheet, pppSheet, tallySheet, auctions, itemList, auctionList, userList) {
        const focusedValue = interaction.options.getFocused(true);
        await interaction.respond(itemList.filter(a => a.name.toLowerCase().includes(focusedValue.value.toLowerCase())).map(a => ({ name: a.name, value: a.name })).slice(0, 25));
    },
    ephemeral: true,
    async execute(interaction, client, author, supabase, dkpSheet, pppSheet, tallySheet, auctions, dkpChannel, pppChannel) {
        let itemName = interaction.options.getString('item');
        let { data: item, error } = await supabase.from('items').select('*').eq('name', itemName).eq('available', true).limit(1);
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

        if (item.type == 'DKP' && author.frozen) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Account Frozen')
                .setDescription('Your account is frozen. You cannot manage auctions or place bids on DKP items this time.');
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }
    
        let auction;
        ({ data: auction, error } = await supabase.from('auctions').select('*').eq('item', item.name).eq('open', true).limit(1));
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
        ({ error } = await supabase.from('auctions').insert({ item: item.name, host: author.username }));
        if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Creating Auction', error.message)] });
        const newEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`Auction Started`)
            .setDescription(`Auction for **${item.name}** has been opened.`);
        await interaction.editReply({ embeds: [newEmbed] });

        const logEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`Auction for ${item.name} (Open)`)
            .addFields(
                { name: 'Next Bid', value: `${config.auction[item.type].min} ${item.type}` },
                { name: 'Bids', value: '```​```' }
            )
            .setFooter({ text: `Opened by ${author.username}` })
            .setTimestamp();
        (auctions[item.name] = {})[item.type] = { embed: logEmbed }
        try  {
            auctions[item.name][item.type].message = await (item.type == 'DKP' ? dkpChannel : pppChannel).send({ embeds: [logEmbed] });
        } catch (err) {
            console.log('Error sending auction message:', err);
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription(`Failed to send auction message for **${item.name}**.`);
            await interaction.editReply({ content: '', embeds: [newEmbed, errorEmbed] });
        }
        try {
            fs.writeFileSync('./auctions.json', JSON.stringify(auctions, '', '  '));
        } catch (err) {
            console.log('Error saving auctions:', err);
        }
    }
}
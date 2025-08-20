const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { errorEmbed } = require('../commonFunctions.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unregister')
    .setDescription('Deletes a user\'s account')
    .addStringOption(option =>
        option.setName('username')
            .setDescription('your in-game username')
            .setRequired(true)
            .setAutocomplete(true)
        ),
    async autocomplete(interaction, client, supabase, dkpSheet, pppSheet, tallySheet, auctions, itemList, auctionList, userList) {
        const focusedValue = interaction.options.getFocused(true);
        await interaction.respond(userList.filter(a => a.username.toLowerCase().includes(focusedValue.value.toLowerCase())).map(a => ({ name: a.username, value: a.username })).slice(0, 25));
    },
    ephemeral: false,
    async execute(interaction, client, author, supabase, dkpSheet, pppSheet, tallySheet, auctions) {
        const username = interaction.options.getString('username');

        if ((await supabase.from(config.supabase.tables.users).select('*').eq('id', interaction.user.id).limit(1)).data[0] == null) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .addFields({ name: 'Error', value: `Account "${username}" not found` });
            await interaction.editReply({ content: '', embeds: [errorEmbed] });
            return;
        }

        let error;
        try {
            let response = await supabase.from(config.supabase.tables.users).delete().eq('username', username);
            
            if (response.error) error = response.error;
            else {
                const newEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .addFields({ name: 'Account Deleted', value: `${username}'s account has been deleted` });
                await interaction.editReply({ embeds: [newEmbed] });
            }
        } catch (err) { error = err; }
        if (error) await interaction.editReply({ content: '', embeds: [errorEmbed('Error Creating Account', error.message)] });
    } 
}
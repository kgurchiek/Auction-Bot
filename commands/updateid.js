const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { errorEmbed } = require('../commonFunctions.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('updateid')
    .setDescription('Updates a user\'s discord id (staff only)')
    .addStringOption(option =>
        option.setName('user')
            .setDescription('the user to update')
            .setRequired(true)
            .setAutocomplete(true)
    )
    .addStringOption(option =>
        option.setName('id')
            .setDescription('the new id to update to')
            .setRequired(true)
    ),
    async autocomplete(interaction, client, supabase, auctions, itemList, auctionList, userList) {
        const focusedValue = interaction.options.getFocused(true);
        await interaction.respond(userList.filter(a => a.username.toLowerCase().includes(focusedValue.value.toLowerCase())).map(choice => ({ name: choice.username, value: choice.username })).sort((a, b) => a.name > b.name ? 1 : -1).slice(0, 25));
    },
    ephemeral: true,
    async execute(interaction, client, author, supabase) {
        const user = interaction.options.getString('user');
        const id = interaction.options.getString('id');

        if (!author.staff) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription(`This command is only available to staff.`);
            return await interaction.editReply({ embeds: [errorEmbed] });
        }

        let { error } = await supabase.from(config.supabase.tables.users).update({ id }).eq('username', user);
        if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Updating User', error.message)] });
        let embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('Success')
            .setDescription(`${user}'${user.endsWith('s') ? '' : 's'} id has been updated to "${id}"`)
        await interaction.editReply({ embeds: [embed] });
    }
}
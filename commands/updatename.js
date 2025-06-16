const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { errorEmbed } = require('../commonFunctions.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('updatename')
    .setDescription('Updates a user\'s username (staff only)')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('the user to update')
            .setRequired(true)
    )
    .addStringOption(option =>
        option.setName('name')
            .setDescription('the new username to update to')
            .setRequired(true)
    ),
    async execute(interaction, client, author, supabase, dkpSheet, pppSheet, tallySheet, auctions) {
        await interaction.deferReply();
        const user = interaction.options.getUser('user');
        const name = interaction.options.getString('name');

        if (!author.staff) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription(`This command is only available to staff.`);
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }

        let { error } = await supabase.from('users').update({ username: name }).eq('id', user.id);
        if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Updating User', error.message)] });
        let embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('Success')
            .setDescription(`<@${user.id}>'s username has been updated to "${name}"`)
        await interaction.editReply({ embeds: [embed] });
    }
}
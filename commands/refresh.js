const { SlashCommandBuilder, EmbedBuilder, Embed } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('refresh')
    .setDescription('Fetches spreadsheets (staff only)'),
    async execute(interaction, client, author, supabase, dkpSheet, pppSheet, tallySheet, auctions, dkpChannel, pppChannel, googleSheets, updateSheets) {
        await interaction.deferReply();
        let embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('Fetching Sheets...')
            .setDescription('please wait')
        await interaction.editReply({ embeds: [embed] });

        await updateSheets();
        embed.setTitle('Success');
        embed.setDescription('sheets updated');
        await interaction.editReply({ embeds: [embed] });
    } 
}
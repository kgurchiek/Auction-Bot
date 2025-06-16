const { SlashCommandBuilder, EmbedBuilder, Embed } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('refresh')
    .setDescription('Fetches spreadsheets (staff only)'),
    async execute(interaction, client, author, supabase, dkpSheet, pppSheet, tallySheet, auctions, dkpChannel, pppChannel, googleSheets, updateSheets) {
        await interaction.deferReply();

        if (!author.staff) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription(`This command is only available to staff.`);
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }
        
        let embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('Fetching Sheets...')
            .setDescription('Please wait')
        await interaction.editReply({ embeds: [embed] });

        await updateSheets();
        embed.setTitle('Success');
        embed.setDescription('Sheets updated');
        await interaction.editReply({ embeds: [embed] });
    } 
}
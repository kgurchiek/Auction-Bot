const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { errorEmbed } = require('../commonFunctions.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('user')
    .setDescription('Gets information about a user')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('the user to get information about')
    ),
    async execute(interaction, client, author, supabase, dkpSheet, pppSheet, tallySheet, auctions) {
        await interaction.deferReply();
        const user = (interaction.options.getUser('user') || interaction.user);
        let { data: account, error } = await supabase.from('users').select('id::text, username, dkp, ppp').eq('id', user.id).limit(1);

        if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Fetching User'. error.message)] });
        account = account[0];
        if (account == null) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .addFields({ name: 'Error', value: `<@${user.id}> has not registered.` });
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }

        const newEmbed = new EmbedBuilder()
            .setTitle(account.username)
            .setDescription(`**DKP:** ${account.dkp}\n**PPP:** ${account.ppp}`);
        await interaction.editReply({ embeds: [newEmbed] });
    } 
}
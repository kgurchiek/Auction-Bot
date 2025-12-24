const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { errorEmbed } = require('../commonFunctions.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Creates an account to begin using the bot')
    .addStringOption(option =>
        option.setName('username')
            .setDescription('your in-game username')
            .setRequired(true)
        ),
    ephemeral: false,
    async execute(interaction, client, author, supabase) {
        const username = interaction.options.getString('username');

        if ((await supabase.from(config.supabase.tables.users).select('*').eq('id', interaction.user.id).limit(1)).data[0] != null) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .addFields({ name: 'Error', value: 'You have already created an account.' });
            await interaction.editReply({ content: '', embeds: [errorEmbed] });
            return;
        }
        if ((await supabase.from(config.supabase.tables.users).select('*').eq('username', username).limit(1)).data[0] != null) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .addFields({ name: 'Error', value: 'That username is already taken.' });
            await interaction.editReply({ content: '', embeds: [errorEmbed] });
            return;
        }

        let error;
        try {
            let response = await supabase.from(config.supabase.tables.users).insert({ id: interaction.user.id, username: username, dkp: 0, ppp: 0, frozen: false });
            
            if (response.error) error = response.error;
            else {
                const newEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .addFields({ name: 'Account Created', value: `Your account has been created with the username **${username}**` });
                await interaction.editReply({ embeds: [newEmbed] });
            }
        } catch (err) { error = err; }
        if (error) await interaction.editReply({ content: '', embeds: [errorEmbed('Error Creating Account', error.message)] });
    } 
}
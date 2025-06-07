const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { errorEmbed } = require('../commonFunctions.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Creates an account to begin using the bot')
    .addStringOption(option =>
        option.setName('username')
            .setDescription('your in-game username')
            .setRequired(true)
            .setAutocomplete(true)
        ),
    async autocomplete(interaction, client, supabase, dkpSheet, pppSheet, tallySheet) {
        let usernames = tallySheet.map(a => a[0]);
        const focusedValue = interaction.options.getFocused(true);
        await interaction.respond(usernames.filter(a => a.toLowerCase().includes(focusedValue.value.toLowerCase())).slice(0, 25).map(choice => ({ name: choice, value: choice })));
    },
    async execute(interaction, client, author, supabase, dkpSheet, pppSheet, tallySheet, auctions) {
        await interaction.deferReply();
        const username = interaction.options.getString('username');

        if ((await supabase.from('users').select('*').eq('id', interaction.user.id).limit(1)).data[0] != null) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .addFields({ name: 'Error', value: 'You have already created an account.' });
            await interaction.editReply({ content: '', embeds: [errorEmbed] });
            return;
        }
        if (!tallySheet.map(a => a[0]).includes(username)) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .addFields({ name: 'Error', value: 'Unknown username. Please contact a staff member.' });
            await interaction.editReply({ content: '', embeds: [errorEmbed] });
            return;
        }
        if ((await supabase.from('users').select('*').eq('username', username).limit(1)).data[0] != null) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .addFields({ name: 'Error', value: 'That username is already taken.' });
            await interaction.editReply({ content: '', embeds: [errorEmbed] });
            return;
        }

        let error;
        try {
            let response = await supabase.from('users').insert({ id: interaction.user.id, username: username, dkp: dkpSheet.find(a => a[0] == username)?.[2] || 0, ppp: pppSheet.find(a => a[0] == username)?.[2] || 0, frozen: false });
            
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
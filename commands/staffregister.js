const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { errorEmbed } = require('../commonFunctions.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('staffregister')
    .setDescription('Creates an account for another user (staff only)')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('the user to create an account for')
            .setRequired(true)
    )
    .addStringOption(option =>
        option.setName('username')
            .setDescription('the user\'s in-game username')
            .setRequired(true)
            .setAutocomplete(true)
    )
    .addNumberOption(option =>
        option.setName('dkp')
            .setDescription('the user\'s DKP')
    )
    .addNumberOption(option =>
        option.setName('ppp')
            .setDescription('the user\'s PPP')
    ),
    async autocomplete(interaction, client, users, pppSheet, dkpSheet, tallySheet) {
        let usernames = tallySheet.map(a => a[0]);
        const focusedValue = interaction.options.getFocused(true);
        await interaction.respond(usernames.filter(a => a.toLowerCase().includes(focusedValue.value.toLowerCase())).map(choice => ({ name: choice, value: choice })).slice(0, 25));
    },
    ephemeral: false,
    async execute(interaction, client, author, supabase, pppSheet, dkpSheet, tallySheet) {
        if (!author.staff) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription(`This command is only available to staff.`);
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }

        const user = interaction.options.getUser('user');
        const username = interaction.options.getString('username');
        const dkp = interaction.options.getNumber('dkp');
        const ppp = interaction.options.getNumber('ppp');

        if ((await supabase.from('users').select('*').eq('id', user.id).limit(1)).data[0] != null) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .addFields({ name: 'Error', value: 'This user already has an account.' });
            await interaction.editReply({ content: '', embeds: [errorEmbed] });
            return;
        }
        let account = (await supabase.from('users').select('id::text').eq('username', username).limit(1)).data[0];
        if (account != null) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .addFields({ name: 'Error', value: `That username is already in use by <@${account.id}>` });
            await interaction.editReply({ content: '', embeds: [errorEmbed] });
            return;
        }

        let error;
        try {
            let response = await supabase.from('users').insert({ id: user.id, username: username, dkp: dkp || dkpSheet.find(a => a[0] == username)?.[2] || 0, ppp: ppp || pppSheet.find(a => a[0] == username)?.[2] || 0, frozen: false });
            
            if (response.error) error = response.error;
            else {
                const newEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .addFields({ name: 'Account Created', value: `<@${user.id}>'s account has been created with the username **${username}**` });
                await interaction.editReply({ embeds: [newEmbed] });
            }
        } catch (err) { error = err; }
        if (error) await interaction.editReply({ content: '', embeds: [errorEmbed('Error Creating Account', error.message)] });
    } 
}
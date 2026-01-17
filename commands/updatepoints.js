const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { errorEmbed } = require('../commonFunctions.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('updatepoints')
    .setDescription('Updates a user\'s points (staff only)')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('the user to update')
            .setRequired(true)
    )
    .addStringOption(option =>
        option.setName('type')
            .setDescription('the type of points (dkp/ppp)')
            .setChoices(
                { name: 'DKP', value: 'dkp' },
                { name: 'PPP', value: 'ppp' }
            )
            .setRequired(true)
    )
    .addNumberOption(option =>
        option.setName('amount')
            .setDescription('the new amount of points')
            .setRequired(true)
    ),
    ephemeral: true,
    async execute(interaction, client, author, supabase) {
        const user = interaction.options.getUser('user');
        const type = interaction.options.getString('type');
        const amount = interaction.options.getNumber('amount');

        if (!author.staff) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription(`This command is only available to staff.`);
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }

        let update = {};
        update[type] = amount;
        let { error } = await supabase.from(config.supabase.tables.users).update(update).eq('id', user.id);
        if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Updating User', error.message)] });
        let embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('Success')
            .setDescription(`<@${user.id}>'s points have been updated`)
        await interaction.editReply({ embeds: [embed] });
    }
}
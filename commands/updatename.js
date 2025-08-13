const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
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
            .setAutocomplete(true)
    ),
    async autocomplete(interaction, client, supabase, dkpSheet, pppSheet, tallySheet, auctions, itemList, auctionList, userList) {
        const focusedValue = interaction.options.getFocused(true);
        await interaction.respond(tallySheet.map(a => a[0]).filter(a => a.toLowerCase().includes(focusedValue.value.toLowerCase())).map(choice => ({ name: choice, value: choice })).slice(0, 25));
    },
    ephemeral: true,
    async execute(interaction, client, author, supabase, dkpSheet, pppSheet, tallySheet, auctions) {
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

        let { error } = await supabase.from(config.supabase.tables.users).update({ username: name }).eq('id', user.id);
        if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Updating User', error.message)] });
        let embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('Success')
            .setDescription(`<@${user.id}>'s username has been updated to "${name}"`)
        await interaction.editReply({ embeds: [embed] });
    }
}
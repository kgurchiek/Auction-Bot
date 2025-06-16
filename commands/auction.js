const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { errorEmbed } = require('../commonFunctions.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('auction')
    .setDescription('Gets information about an open auction')
    .addStringOption(option =>
        option.setName('auction')
            .setDescription('the auction to get information about')
            .setRequired(true)
            .setAutocomplete(true)
    ),
    async autocomplete(interaction, client, supabase, dkpSheet, pppSheet, tallySheet, auctions, itemList, auctionList, userList) {
        const focusedValue = interaction.options.getFocused(true);
        await interaction.respond(auctionList.filter(a => a.item.name.toLowerCase().includes(focusedValue.value.toLowerCase())).map(a => ({ name: a.item.name, value: a.item.name })).slice(0, 25));
    },
    async execute(interaction, client, author, supabase, dkpSheet, pppSheet, tallySheet, auctions) {
        await interaction.deferReply();
        let { data: auction, error } = await supabase.from('auctions').select('start, item, bids, host (id, username)').eq('item', interaction.options.getString('auction')).eq('open', true).limit(1);
        if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Fetching Auction', error.message)] });
        auction = auction[0];
        if (auction == null) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .addFields({ name: 'Error', value: `There are no open auctions for **${item}**.` });
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`Auction for ${auction.item}`)
            .addFields(
                { name: 'Opened', value: `<t:${Math.floor(new Date(auction.start).getTime() / 1000)}>`, inline: true },
                { name: 'Bids', value: auction.bids.length > 0 ? `\`\`\`${auction.bids.sort((a, b) => b.amount - a.amount).map(a => `${a.user}: ${a.amount}`).slice(0, 15).join('\n')}${auction.bids.length > 15 ? '\n...' : ''}\`\`\`` : 'No bids yet' }
            )
        await interaction.editReply({ embeds: [embed] });
    } 
}
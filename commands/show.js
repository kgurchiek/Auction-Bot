const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { errorEmbed } = require('../commonFunctions.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('show')
    .setDescription('Gets information about a user')
    .addStringOption(option =>
        option.setName('type')
            .setDescription('DKP/PPP')
            .setRequired(true)
            .addChoices(
                { name: 'DKP', value: 'DKP' },
                { name: 'PPP', value: 'PPP' }
            )
    )
    .addNumberOption(option =>
        option.setName('length')
            .setDescription('how many winners to show')
            .setMinValue(1)
            .setMaxValue(100)
    ),
    ephemeral: false,
    async execute(interaction, client, author, supabase, dkpSheet, pppSheet, tallySheet, auctions) {
        const type = interaction.options.getString('type');
        const length = interaction.options.getNumber('length') || 10;
        let { data: auctionList, error } = await supabase.from(config.supabase.tables.auctions).select('end, item!inner(name, type), open, winner, price').eq('open', false).neq('winner', null).eq('item.type', type).order('end', { ascending: false }).limit(length);
        if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Fetching Recent Auctions', error.message)] });

        let embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`Recent ${type} Auction Winners`)
        for (let i = 0; embed.data.description == null || embed.data.description.length > 4096; i++) embed.data.description = `${auctionList.map(a => `- **${a.winner}**: ${a.item.name} (${a.price} ${type})`).slice(0, auctionList.length - i).join('\n')}${i > 0 ? '\n...' : ''}`;
        await interaction.editReply({ embeds: [embed] });
    }
}
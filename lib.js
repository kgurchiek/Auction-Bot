const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('./config.json');

module.exports = {
    newLogEmbed(host, item, monster, type, start, bids) {
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`Auction for ${item} (Open)`)
            .setDescription(`### Opened <t:${start}:R>`)
            .setAuthor({ name: 'Heirloom\'s Auction Bot', iconURL: 'https://mrqccdyyotqulqmagkhm.supabase.co/storage/v1/object/public/images//profile.png' })
            .setThumbnail(`https://mrqccdyyotqulqmagkhm.supabase.co/storage/v1/object/public/images//${monster.split('(')[0].replaceAll(' ', '')}.png`)
            .addFields(
                { name: 'Next Bid', value: `${bids.length == 0 ? 0 : Math.round((bids[0].amount + config.auction[type].raise) * 10) / 10} ${type}` },
                { name: 'Bids', value: `\`\`\`${bids.length == 0 ? '​' : bids.slice(0, 15).map(a => `${a.user}: ${a.amount} ${type}`).join('\n')}${bids.length > 10 ? '\n...' : ''}\`\`\`` }
            )
            .setFooter({ text: `Opened by ${host}` })
            .setTimestamp();
        let buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`bid-${item}`)
                    .setStyle(ButtonStyle.Primary)
                    .setLabel('Bid'),
                new ButtonBuilder()
                    .setCustomId(`closeitem-${item}-false`)
                    .setStyle(ButtonStyle.Danger)
                    .setLabel('Close')
            );
        
        return { embed, buttons };
    }
}
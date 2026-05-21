const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const config = require('./config.json');

module.exports = {
    createAuctionEmbed(host, item, monster, type, start, bids) {
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
    },
    createMonsterEmbed(host, monster, items, start, bids) {
        let rareex = items.filter(a => !a.tradeable).sort((a, b) => a.name > b.name ? 1 : -1);
        let tradeables = items.filter(a => a.tradeable).sort((a, b) => a.name > b.name ? 1 : -1);
        let embeds = {};
        let dropdowns = {};
        for (let type of ['DKP', 'PPP']) {
            embeds[type] = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`Auction for ${monster} (Open)`)
                .setDescription(`### Opened <t:${start}:R>`)
                .setAuthor({ name: 'Heirloom\'s Auction Bot', iconURL: 'https://mrqccdyyotqulqmagkhm.supabase.co/storage/v1/object/public/images//profile.png' })
                .setThumbnail(`https://mrqccdyyotqulqmagkhm.supabase.co/storage/v1/object/public/images//${monster.split('(')[0].replaceAll(' ', '')}.png`)
                .setFooter({ text: `Opened by ${host}` })
                .setTimestamp();
            dropdowns[type] = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('bid')
                        .setPlaceholder('Select an item')
                        .addOptions(
                            ...rareex.filter(a => a.type == type).concat(tradeables.filter(a => a.type == type)).map(a =>
                                new StringSelectMenuOptionBuilder()
                                    .setLabel(a.name)
                                    .setValue(`${a.name}-${a.tradeable}-${a.type}-${a.monster}`)
                            )
                        )
                )
        }
        let buttons = new ActionRowBuilder();
        if (rareex.length) {
            buttons.addComponents(
                new ButtonBuilder()
                    .setCustomId(`closemonster-${monster}-false`)
                    .setLabel('Close Rare/Ex')
                    .setStyle(ButtonStyle.Primary)
            )
        }
        buttons.addComponents(
            new ButtonBuilder()
                .setCustomId(`closeall-${monster}-false`)
                .setLabel('Close Everything')
                .setStyle(ButtonStyle.Danger)
        )
        for (let item of rareex.concat(rareex.reduce((a, b) => a.find(c => c.type == b.type) ? a : a.concat({ type: b.type }), []), tradeables)) {
            let embed = embeds[item.type];
            if (item.name == null) {
                if (rareex.length && tradeables.length) embed.addFields({ name: '​\n——————————————————————————', value: '​' });
                continue;
            }
            let highestBids = bids.filter((a, i, arr) => a.amount == arr[arr.length - 1].amount);
            let value = '';
            for (let i = 0; i == 0 || value.length > 1024; i++) value = highestBids.length == 0 ? '​' : `**Highest Bid${highestBids.length == 1 ? '' : 's'}:**\n🥇${highestBids.map(a => a.user).slice(0, highestBids.length - i).join(', ')}${i == 0 ? '' : ', ...'} (${highestBids[0].amount} ${item.type})`;
            embed.addFields({ name: `${item.tradeable ? '💰 ' : ''}**[${item.name}]** __${highestBids.length == 0 ? '*No Bids*' : `*Current Bid: **(${highestBids[0].amount} ${item.type})***`}__`, value });
        }

        return { embeds, dropdowns, buttons };
    }
}
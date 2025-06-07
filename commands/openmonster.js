const fs = require('fs');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { errorEmbed } = require('../commonFunctions.js');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('openmonster')
    .setDescription('opens an auction on a monster')
    .addStringOption(option =>
        option.setName('monster')
            .setDescription('the monster whose items are to be sold')
            .setRequired(true)
            .setAutocomplete(true)
    ),
    async autocomplete(interaction, client, supabase, dkpSheet, pppSheet, tallySheet) {
        const focusedValue = interaction.options.getFocused(true);
        let { data: items } = await supabase.from('items').select('*').eq('available', true);
        if (items == null) items = [];
        let monsters = items.map(a => a.monster).filter((a, i, arr) => !arr.slice(0, i).includes(a));
        await interaction.respond(monsters.filter(a => a.toLowerCase().includes(focusedValue.value.toLowerCase())).sort((a, b) => a > b ? 1 : -1).map(a => ({ name: a, value: a })).slice(0, 25));
    },
    async execute(interaction, client, author, supabase, dkpSheet, pppSheet, tallySheet, auctions, dkpChannel, pppChannel) {
        await interaction.deferReply({ ephemeral: true });
        const monster = interaction.options.getString('monster');
        
        let { data: items, error } = await supabase.from('items').select('*').eq('monster', monster);
        if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Fetching Monster', error.message)] });

        if (items.length == 0) {
            const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('Error')
            .setDescription(`Monster **${monster}** not found.`);
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }
        
        // let embeds = [];
        let frozen = 0;
        let opened = [];
        for (const item of items) {
            if (item.type == 'DKP' && author.frozen) {
                frozen++;
                // const errorEmbed = new EmbedBuilder()
                //     .setColor('#ff0000')
                //     .setTitle('Account Frozen')
                //     .setDescription('Your account is frozen. You cannot manage auctions or place bids on DKP items this time.');
                // await interaction.editReply({ embeds: [errorEmbed] });
                // return;
                // embeds.push(errorEmbed);
                continue;
            }
        
            let auction;
            ({ data: auction, error } = await supabase.from('auctions').select('*').eq('item', item.name).eq('open', true).limit(1));
            if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Fetching Auctions', error.message)] });
            auction = auction[0];
            if (auction != null) {
                // const errorEmbed = new EmbedBuilder()
                //     .setColor('#ff0000')
                //     .setTitle('Error')
                //     .setDescription(`Auction for **${item.name}** is already open.`);
                // await interaction.editReply({ embeds: [errorEmbed] });
                // return;
                // embeds.push(errorEmbed);
                continue;
            }
            ({ error } = await supabase.from('auctions').insert({ item: item.name, host: author.username }));
            if (error) return await interaction.editReply({ content: '', embeds: [errorEmbed('Error Creating Auction', error.message)] });
            // const newEmbed = new EmbedBuilder()
            //     .setColor('#00ff00')
            //     .setTitle(`Auction Started`)
            //     .setDescription(`Auction for **${item.name}** has been opened.`);
            // await interaction.editReply({ embeds: [newEmbed] });
            // embeds.push(newEmbed);

            opened.push(item);
        }

        const newEmbed = new EmbedBuilder()
            .setColor(opened.length > 0 ? '#00ff00' : '#ff0000')
            .setDescription(`Opened ${opened.length} item${opened.length == 1 ? '' : 's'}${frozen > 0 ? `\n**Warning:** ${frozen} item${frozen == 1 ? '' : 's'} couldn't be opened due to your account being frozen.` : ''}`);
        await interaction.editReply({ content: '', embeds: [newEmbed] });

        if (opened.length == 0) return;
        let auction;
        ({ data: auction, error } = await supabase.from('auctions').select('item!inner(name, monster), bids').eq('item.monster', monster).eq('open', true));
        if (error) return await interaction.editReply({ content: '', embeds: [newEmbed, errorEmbed('Error Fetching Auctions', error.message)] });

        const dkpEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`Auction for ${monster} (Open)`)
            .setFooter({ text: `Opened by ${author.username}` })
            .setTimestamp();
        const pppEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`Auction for ${monster} (Open)`)
            .setFooter({ text: `Opened by ${author.username}` })
            .setTimestamp();
        for (const item of items) {
            let bid = auction.find(a => item.name == a.item.name).bids.sort((a, b) => b.amount - a.amount)[0];
            (item.type == 'DKP' ? dkpEmbed : pppEmbed).addFields({ name: item.name, value: bid == null ? 'No Bids' : `Highest Bid: ${bid.user} ${bid.amount} ${item.type}`});
        }
        auctions[monster] = {}
        try {
            if (items.find(a => a.type == 'DKP')) auctions[monster].DKP = { embed: dkpEmbed, message: await dkpChannel.send({ embeds: [dkpEmbed] }) };
            if (items.find(a => a.type == 'PPP')) auctions[monster].PPP = { embed: pppEmbed, message: await pppChannel.send({ embeds: [pppEmbed] }) };
        } catch (err) {
            return await interaction.editReply({ content: '', embeds: [newEmbed, errorEmbed(`Error Sending Auction Message for ${monster}`, error.message)] });
        }
        try {
            fs.writeFileSync('./auctions.json', JSON.stringify(auctions, '', '  '));
        } catch (err) {
            console.log('Error saving auctions:', err);
        }
    }
}
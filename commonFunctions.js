const { EmbedBuilder } = require('discord.js');
module.exports = {
    errorEmbed: (name, error, message = 'Please try again later.') => {
        console.log(`[Error]: ${name} - ${error}`);
        return new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle(name)
            .setDescription(`\`${error}\`\n\n ${message}`);
    }
}
const fs = require('fs');
const path = require('path');

function processFile(filepath, componentName) {
    let content = fs.readFileSync(filepath, 'utf-8');

    // 1. Inject onDeleteRating prop
    if (!content.includes('onDeleteRating') && content.includes(`const ${componentName} =`)) {
        const regex = new RegExp(`(const ${componentName} = \\(\\{[\\s\\S]*?)(\\}\\) => \\{)`);
        content = content.replace(regex, `$1, onDeleteRating $2`);
        content = content.replace(', , onDeleteRating', ', onDeleteRating');
    }

    // 2. Inject the UI below buttonsRow
    if (!content.includes('deleteButton') && (content.includes('buttonsRow') || content.includes('buttonsContainer'))) {
        const uiStr = `
            {onDeleteRating && (
                <View style={{ alignItems: 'center', marginTop: 15, marginBottom: 10 }}>
                    <TouchableOpacity style={styles.deleteButton} onPress={onDeleteRating}>
                        <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FF6347" style={{ marginRight: 5 }} />
                        <Text style={styles.deleteButtonText}>Remove Rating</Text>
                    </TouchableOpacity>
                </View>
            )}
`;
        // Find the last closing View of buttonsRow or Container. 
        // We can just use string replacement on the exact structure.

        let targetRegex;
        if (componentName === 'PizzaRating') {
            targetRegex = /(<View style=\{styles\.buttonsContainer\}>[\s\S]*?<\/View>)/;
        } else {
            targetRegex = /(<View style=\{styles\.buttonsRow\}>[\s\S]*?<\/View>)/;
        }

        content = content.replace(targetRegex, `$1${uiStr}`);
    }

    // 3. Inject Styles
    if (!content.includes('deleteButton:')) {
        const styleStr = `,
    deleteButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 99, 71, 0.1)',
    },
    deleteButtonText: {
        color: '#FF6347',
        fontSize: 14,
        fontWeight: 'bold',
    }
});`;
        content = content.replace('\n});', styleStr);
    }

    fs.writeFileSync(filepath, content, 'utf-8');
    console.log(`Processed ${filepath}`);
}

try {
    processFile(path.join(__dirname, 'context', 'PizzaRating.js'), 'PizzaRating');
    processFile(path.join(__dirname, 'context', 'PercentageRating.js'), 'PercentageRating');
    processFile(path.join(__dirname, 'context', 'AwardsRating.js'), 'AwardsRating');
} catch (e) {
    console.error(e);
}

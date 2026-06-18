import sys
import re

def process_file(filepath, component_name):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Inject onDeleteRating prop
    if "onDeleteRating" not in content and f"const {component_name} =" in content:
        # Find the props line and inject
        content = re.sub(
            r"(const " + component_name + r" = \(\{[\s\S]*?)(\}\) => \{)",
            r"\1, onDeleteRating \2",
            content,
            count=1
        )
        # Fix potential ", , " typo
        content = content.replace(", , onDeleteRating", ", onDeleteRating")
        
    # 2. Inject the UI below buttonsRow
    if "deleteButton" not in content and "buttonsRow" in content:
        ui_str = """
            {onDeleteRating && (
                <View style={{ alignItems: 'center', marginTop: 15, marginBottom: 10 }}>
                    <TouchableOpacity style={styles.deleteButton} onPress={onDeleteRating}>
                        <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FF6347" style={{ marginRight: 5 }} />
                        <Text style={styles.deleteButtonText}>Remove Rating</Text>
                    </TouchableOpacity>
                </View>
            )}
        """
        # For Pizza and Percentage, buttonsRow is inside <View style={styles.buttonsRow}>...</View>
        # Just find the closing </View> of the buttonsRow. We'll do a simple split and replace
        parts = content.split('</TouchableOpacity>')
        if len(parts) >= 3:
            # Usually the submit button is the second touchable opacity in the buttons row, so it's after the 2nd one.
            # actually let's use regex to find the buttonsRow block
            pass
            
        content = re.sub(
            r"(<View style=\{styles\.buttons(?:Row|Container)\}>[\s\S]*?</View>)",
            r"\1" + ui_str,
            content,
            count=1
        )
        
    # 3. Inject Styles
    if "deleteButton:" not in content:
        style_str = """,
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
        fontSize: Dimensions.get('window').width * 0.035 if typeof Dimensions !== 'undefined' else 14,
        fontWeight: 'bold',
    }
});"""
        # We need to make sure Dimensions is used safely, or use a hardcoded 14. 
        # Actually screenWidth/SCREEN_WIDTH is defined in these files.
        # Let's just use 14 for safety, it scales okay.
        style_str_safe = """,
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
});"""
        content = content.replace("\n});", style_str_safe)
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
        
    print(f"Processed {filepath}")

process_file(r'c:\dev\TOMO\context\PizzaRating.js', 'PizzaRating')
process_file(r'c:\dev\TOMO\context\PercentageRating.js', 'PercentageRating')
process_file(r'c:\dev\TOMO\context\AwardsRating.js', 'AwardsRating')

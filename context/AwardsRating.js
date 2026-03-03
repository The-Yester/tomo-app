import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import Slider from '@react-native-community/slider';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

// Colors (Light/Gold Theme)
const COLOR_BG = 'transparent';
const COLOR_CARD_BG = '#F2F2F2';
const COLOR_TEXT_PRIMARY = '#000000';
const COLOR_TEXT_SECONDARY = '#666666';
const COLOR_ACCENT = '#d4a03e'; // TOPO Gold
const COLOR_SLIDER_MAX = '#E0E0E0';

const SCREEN_WIDTH = Dimensions.get('window').width;

const AWARD_CATEGORIES = [
  'Sound',
  'Style',
  'Drums',
  'Impact',
  'Lyrics',
  'Structure',
  'Expression',
  'Reception'
];

// Memoized Row Component to ensure smooth slider performance
const CategoryRow = memo(({ category, value, onValueChange }) => {
  return (
    <View style={styles.row}>
      <View style={styles.labelContainer}>
        <Text style={styles.categoryLabel}>{category}</Text>
        <Text style={[styles.valueText, value === 0 && styles.valueTextDisabled]}>
          {value > 0 ? value.toFixed(1) : "N/A"}
        </Text>
      </View>

      <View style={styles.sliderContainer}>
        <Slider
          style={{ width: '100%', height: 40 }}
          minimumValue={0}
          maximumValue={10}
          step={0.1} // Smooth 0.1 increments
          value={value}
          onValueChange={onValueChange}
          minimumTrackTintColor={value > 0 ? COLOR_ACCENT : '#555'}
          maximumTrackTintColor={COLOR_SLIDER_MAX}
          thumbTintColor={value > 0 ? COLOR_ACCENT : '#777'}
        />
        <View style={styles.ticksConfig}>
          <Text style={styles.tickLabel}>0</Text>
          <Text style={styles.tickLabel}>5</Text>
          <Text style={styles.tickLabel}>10</Text>
        </View>
      </View>
    </View>
  );
}, (prevProps, nextProps) => {
  // Custom equality check: only re-render if value changed
  return prevProps.value === nextProps.value;
});

const DEFAULT_EXCLUDED = [];

const AwardsRating = ({ initialRatings = {}, onChange, excludedCategories = DEFAULT_EXCLUDED, isPlayed, onTogglePlayed }) => {
  const [ratings, setRatings] = useState(() => {
    const defaultRatings = {};
    AWARD_CATEGORIES.forEach(category => {
      const initialValue = initialRatings[category];
      defaultRatings[category] = initialValue !== undefined && initialValue !== null ? parseFloat(initialValue) : 0;
    });
    return defaultRatings;
  });

  // Track last reported to prevent loops
  const lastReportedJson = React.useRef("");

  // Calculate Average on change
  useEffect(() => {
    // Basic structural check to avoid churn
    const currentJson = JSON.stringify(ratings);
    if (currentJson === lastReportedJson.current) return;

    const validValues = Object.entries(ratings)
      .filter(([key, val]) => !excludedCategories.includes(key) && val > 0)
      .map(([_, val]) => val);

    if (validValues.length > 0) {
      const sum = validValues.reduce((acc, val) => acc + val, 0);
      const average = sum / validValues.length;

      // Update ref before calling out
      lastReportedJson.current = currentJson;
      onChange?.(parseFloat(average.toFixed(1)), ratings);
    } else {
      if (lastReportedJson.current !== currentJson) {
        lastReportedJson.current = currentJson;
        onChange?.(null, ratings);
      }
      if (lastReportedJson.current !== currentJson) {
        lastReportedJson.current = currentJson;
        onChange?.(null, ratings);
      }
    }
  }, [ratings, excludedCategories]); // Removed onChange to prevent loops

  // 2. Data Sync: If initialRatings changes (e.g. loaded from DB), update local state
  // This is tricky to do without loops. We only do it if local state is "default" (mostly 0s)
  // OR we assume parent knows best when providing new initialRatings.
  // A safe way is to use a Ref to track if we've "touched" the controls.
  const hasUserInteracted = React.useRef(false);

  useEffect(() => {
    if (!hasUserInteracted.current && initialRatings && Object.keys(initialRatings).length > 0) {
      setRatings(prev => {
        // Merge
        const next = { ...prev };
        let changed = false;
        AWARD_CATEGORIES.forEach(cat => {
          if (initialRatings[cat] !== undefined && initialRatings[cat] !== next[cat]) {
            next[cat] = parseFloat(initialRatings[cat]);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [initialRatings]);

  // Stable callback for updating state
  const handleSliderChange = useCallback((category, value) => {
    hasUserInteracted.current = true; // Mark as user-controlled
    setRatings(prev => ({
      ...prev,
      [category]: parseFloat(value.toFixed(1))
    }));
  }, []);

  const getOverallScore = () => {
    const validValues = Object.entries(ratings)
      .filter(([key, val]) => !excludedCategories.includes(key) && val > 0)
      .map(([_, val]) => val);

    if (validValues.length === 0) return "N/A";
    const sum = validValues.reduce((acc, val) => acc + val, 0);
    return (sum / validValues.length).toFixed(1);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Awards Rating</Text>
        <Text style={styles.subtitle}>Rate categories 0-10 (0 = N/A)</Text>
        <TouchableOpacity
          style={[styles.playedToggle, isPlayed && styles.playedToggleActive]}
          onPress={onTogglePlayed}
        >
          <MaterialCommunityIcons
            name={isPlayed ? "check-circle" : "circle-outline"}
            size={20}
            color={isPlayed ? "#FFFFFF" : COLOR_TEXT_SECONDARY}
          />
          <Text style={[styles.playedToggleText, isPlayed && styles.playedToggleTextActive]}>
            Press to Add to Recently played
          </Text>
        </TouchableOpacity>
        <View style={styles.averageContainer}>
          <Text style={styles.averageLabel}>Overall Score</Text>
          <Text style={styles.averageValue}>{getOverallScore()}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} removeClippedSubviews={true}>
        {AWARD_CATEGORIES.filter(cat => !excludedCategories.includes(cat)).map((category) => (
          <CategoryRow
            key={category}
            category={category}
            value={ratings[category] || 0}
            onValueChange={(val) => handleSliderChange(category, val)}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLOR_BG,
  },
  header: {
    padding: 20,
    backgroundColor: COLOR_BG,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLOR_TEXT_PRIMARY,
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: COLOR_TEXT_SECONDARY,
    marginBottom: 15,
  },
  averageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLOR_CARD_BG,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  averageLabel: {
    fontSize: 16,
    color: COLOR_TEXT_SECONDARY,
    marginRight: 10,
  },
  averageValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLOR_ACCENT,
  },
  scrollContent: {
    paddingHorizontal: 5,
    paddingVertical: 15,
    paddingBottom: 40,
  },
  row: {
    backgroundColor: COLOR_CARD_BG,
    marginBottom: 15,
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingVertical: 20,
    width: '100%',
  },
  labelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  categoryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLOR_TEXT_PRIMARY,
  },
  valueText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLOR_ACCENT,
  },
  valueTextDisabled: {
    color: '#999',
  },
  sliderContainer: {
    width: '100%',
    justifyContent: 'center',
  },
  ticksConfig: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    marginTop: -5,
  },
  tickLabel: {
    fontSize: 10,
    color: '#666',
  },
  playedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E0E0E0',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    marginBottom: 15,
    width: '100%',
  },
  playedToggleActive: {
    backgroundColor: COLOR_ACCENT,
  },
  playedToggleText: {
    color: COLOR_TEXT_SECONDARY,
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  playedToggleTextActive: {
    color: '#FFFFFF',
  }
});

export default AwardsRating;

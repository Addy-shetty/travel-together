import { Share } from 'react-native';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { TripSummary } from './api';
import { categoryLabel } from './api';
import { dateRange } from './dates';
import { formatINR } from './money';

// Share as text (works everywhere)
export function shareAsText(summary: TripSummary): Promise<void> {
  const { trip, total_spent, per_person, categories, settlements } = summary;
  return Share.share({
    message: [
      `${trip.name} · ${dateRange(trip.start_date, trip.end_date)}`,
      `Total spent: ${formatINR(total_spent)} (${formatINR(per_person)} each)`,
      '',
      ...categories.map((c) => `${categoryLabel(c.category)}: ${formatINR(c.amount)}`),
      '',
      'Settle up:',
      ...settlements.map((x) => `${x.from_name} → ${x.to_name}: ${formatINR(x.amount)}${x.status === 'confirmed' ? ' ✓' : ''}`),
      '',
      '— Travel-Together',
    ].join('\n'),
  }).then(() => undefined);
}

// Share as image (for Instagram, WhatsApp stories, etc.)
export async function shareAsImage(viewRef: RefObject<View | null>, tripName: string): Promise<void> {
  if (!viewRef.current) return;

  try {
    // Capture the view as a PNG
    const uri = await captureRef(viewRef, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
    });

    // Check if sharing is available
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      // Fall back to saving to camera roll or showing an alert
      console.warn('Sharing not available, image saved to:', uri);
      return;
    }

    // Share the image
    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      dialogTitle: `Share ${tripName} summary`,
      UTI: 'public.png',
    });

    // Clean up temp file
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // Ignore cleanup errors
    }
  } catch (error) {
    console.error('Failed to share image:', error);
    throw error;
  }
}

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Register for push notifications and store token in Supabase
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device');
    return null;
  }

  // Check/request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Push notification permission denied');
    return null;
  }

  // Get Expo push token
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const token = tokenData.data;

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('No user logged in, skipping push token registration');
      return null;
    }

    // Store in Supabase (upsert handles duplicates)
    const platform = Platform.OS as 'ios' | 'android' | 'web';
    const { error } = await supabase
      .from('push_tokens')
      .upsert({ token, platform, user_id: user.id }, { onConflict: 'token' });

    if (error) {
      console.error('Failed to store push token:', error);
    }

    // Android needs notification channels
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      });
      await Notifications.setNotificationChannelAsync('action-required', {
        name: 'Action Required',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    return token;
  } catch (error) {
    console.error('Failed to get push token:', error);
    return null;
  }
}

// Remove push token on logout
export async function unregisterPushToken(token: string): Promise<void> {
  await supabase.from('push_tokens').delete().eq('token', token);
}

// Handle notification tap (navigate to relevant screen)
export function addNotificationResponseListener(
  handler: (notification: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(handler);
}

// Handle notification received while app is open
export function addNotificationReceivedListener(
  handler: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(handler);
}

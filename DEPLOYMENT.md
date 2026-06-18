# TOMO Deployment Guide

This guide details how to build and submit the TOMO app to the Apple App Store and Google Play Store using Expo Application Services (EAS).

## Prerequisites

1.  **Expo Account**: Ensure you have an account at [expo.dev](https://expo.dev).
2.  **EAS CLI**: Install the CLI globally if you haven't already:
    ```bash
    npm install -g eas-cli
    ```
3.  **Login**:
    ```bash
    eas login
    ```

## 1. Build for Stores

We have configured `eas.json` with a `production` profile.

### Android
To build a production AAB (Android App Bundle) for the Google Play Store:
```bash
eas build --platform android --profile production
```

### iOS
To build a production IPA for the Apple App Store:
```bash
eas build --platform ios --profile production
```
*Note: This requires an Apple Developer Account ($99/year).*

## 2. Submission

You can configure EAS to submit automatically, or do it manually via the stores' dashboards.

### Manual Upload
1.  Download the `.aab` (Android) or `.ipa` (iOS) file from the link provided after the build finishes.
2.  **Android**: Upload to the [Google Play Console](https://play.google.com/console).
3.  **iOS**: Use "Transporter" app on Mac or upload via [App Store Connect](https://appstoreconnect.apple.com).

### Automated Submission (Optional)
You can set up `eas submit` to handle this.
```bash
eas submit --platform ios
eas submit --platform android
```

## 3. Important Notes

- **API Keys**: Ensure `utils/config.js` has the correct production keys.
- **Assets**: Check `app.json` to ensure all icons and splash screens look correct on different devices.
- **Permissions**: If you add new libraries that require sensitive permissions (Camera, Location, etc.), you may need to update `app.json` plugins block or Android manifest config in `app.json` (under `android.permissions`).

## Troubleshooting

If the build fails:
1.  Run `npx expo doctor` to check for dependency issues.
2.  Check the logs provided in the Expo dashboard link.

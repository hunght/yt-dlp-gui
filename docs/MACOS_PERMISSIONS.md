# macOS Permissions Setup for YT-DLP GUI

To enable full browser URL tracking on macOS, YT-DLP GUI requires specific system permissions. This guide explains what permissions are needed and how to grant them.

## Required Permissions

### 1. Accessibility Permission

- **Purpose**: Allows YT-DLP GUI to detect which applications you're using and access window information
- **Required for**: Basic app tracking, window title detection
- **Without this**: App cannot track active applications

### 2. Screen Recording Permission

- **Purpose**: Enables access to browser URLs and detailed window content
- **Required for**: Browser URL extraction, detailed website tracking
- **Without this**: URLs will not be captured from browsers

## How to Grant Permissions

### Automatic Setup

When you first launch YT-DLP GUI, it will automatically:

1. Check if permissions are already granted
2. Show a dialog explaining what permissions are needed
3. Open System Settings to the appropriate permission panels
4. Guide you through the setup process

### Manual Setup

If you need to grant permissions manually:

1. **Open System Settings**
   - Click the Apple menu → System Settings
   - Or use Spotlight: Press Cmd+Space, type "System Settings"

2. **Navigate to Privacy & Security**
   - Click "Privacy & Security" in the sidebar

3. **Grant Accessibility Permission**
   - Click "Accessibility"
   - Click the "+" button or toggle to add YT-DLP GUI
   - Enable the checkbox next to YT-DLP GUI

4. **Grant Screen Recording Permission**
   - Click "Screen Recording"
   - Click the "+" button or toggle to add YT-DLP GUI
   - Enable the checkbox next to YT-DLP GUI

5. **Restart YT-DLP GUI**
   - Quit and relaunch the app for permissions to take effect

## Verification

You can verify permissions are working by:

1. Opening YT-DLP GUI Settings
2. Checking the "Permissions" section
3. Both switches should show as enabled/green
4. If not, click the switches to open System Settings

## Privacy & Security

- **All data stays local**: YT-DLP GUI never sends your browsing data to external servers
- **Secure storage**: All tracking data is stored locally in an encrypted database
- **Your control**: You can review, edit, or delete any tracked data at any time

## Troubleshooting

### Permissions not working after granting

- **Solution**: Restart YT-DLP GUI completely (Quit from menu bar, then relaunch)
- **Reason**: macOS requires app restart for permission changes to take effect

### Can't find YT-DLP GUI in permission lists

- **Solution**: Try running YT-DLP GUI first, then check System Settings
- **Alternative**: Click the "+" button in System Settings to manually locate YT-DLP GUI

### Still not tracking URLs

- **Check both permissions**: Both Accessibility AND Screen Recording must be enabled
- **Restart required**: Always restart YT-DLP GUI after granting new permissions
- **Browser compatibility**: Currently supports Safari, Chrome, Firefox, and Edge

## Support

If you continue to have issues with permissions:

1. Check the app logs in Settings → Logs
2. Try toggling permissions off and on again in System Settings
3. Ensure you're running a supported version of macOS (10.15+)

For additional help, visit the YT-DLP GUI documentation or support channels.

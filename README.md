FocusGuard – Pomodoro + Distraction Blocker
FocusGuard is a Chrome extension that helps you stay focused and productive by combining a Pomodoro timer with intelligent website blocking.

Features
Pomodoro timer with customizable focus and break durations

Automatically blocks distracting websites during focus sessions

Displays motivational quotes when attempting to access blocked sites

Daily goal setting and optional task tracking

Configurable settings for timers, blocked websites, and sounds

Sound and desktop notifications at the end of each session

Installation
Load the Extension in Developer Mode
Download or clone this repository.

Add the required assets:

Place icon files in assets/icons/ (icon16.png, icon48.png, icon128.png)

Place a notification sound file in assets/sounds/ (e.g., beep.mp3)

Open Chrome and navigate to chrome://extensions/

Enable "Developer mode" (top right)

Click "Load unpacked" and select the root folder of the extension

Usage
Click the FocusGuard icon in the Chrome toolbar

Set your daily goal and, optionally, your current task

Start a focus session (default is 25 minutes)

While the timer is running, blocked sites will display an overlay with your goal and a motivational quote

When the focus session ends, a break session begins automatically

Customization
Change focus and break durations in the options page

Add or remove blocked websites

Enable or disable sound notifications

Import or export your settings and usage data

Technical Overview
Built using the Chrome Extension Manifest V3

Uses a service worker to keep the timer running in the background

Stores user settings and progress using the Chrome Storage API

Injects an overlay via content scripts on blocked sites

Uses the Chrome Notifications API to alert the user when sessions end

Default Blocked Sites
The extension blocks the following sites by default during focus sessions:

youtube.com

twitter.com

instagram.com

reddit.com

facebook.com

tiktok.com

You can edit this list at any time from the Settings page.

How It Works
During a focus session, blocked websites are inaccessible and display an overlay.

During breaks, blocked sites are temporarily accessible.

The extension automatically switches between focus and break sessions.

Timer continues running even when the popup is closed, thanks to background logic.

Suggestions for Effective Use
Set a clear, motivating daily goal

Break your work into specific, manageable tasks

Use the break sessions to rest intentionally

Customize your blocked site list to reflect your real distractions

Review your usage data to track your focus habits over time
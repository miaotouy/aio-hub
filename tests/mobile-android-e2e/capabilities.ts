export function createCapabilities(options: {
  serial: string;
  chromedriverPath: string;
  appPackage?: string;
}): WebdriverIO.Capabilities {
  const appPackage = options.appPackage ?? "com.aiohub.mobile";
  return {
    platformName: "Android",
    "appium:automationName": "UiAutomator2",
    "appium:udid": options.serial,
    "appium:deviceName": options.serial,
    "appium:appPackage": appPackage,
    "appium:appActivity": `${appPackage}.MainActivity`,
    "appium:noReset": true,
    "appium:autoGrantPermissions": false,
    "appium:ensureWebviewsHavePages": true,
    "appium:chromedriverExecutable": options.chromedriverPath,
    "appium:nativeWebScreenshot": true,
    "appium:newCommandTimeout": 180,
  };
}

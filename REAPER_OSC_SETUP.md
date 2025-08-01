# Reaper OSC Configuration Guide

This guide explains how to configure Reaper for OSC communication with the Reaper Control Queue application.

## OSC Configuration in Reaper

1. Open Reaper and go to `Preferences > Control/OSC/web`
2. Click on `Add` to create a new OSC device
3. Configure the device with the following settings:
   - **Mode**: Pattern-based
   - **Pattern config**: Default.ReaperOSC
   - **IP address**: 127.0.0.1 (localhost)
   - **Port (receive)**: 9000 (this is where Reaper listens for commands)
   - **Port (send)**: 8000 (this is where Reaper sends responses)
   - **Enable "Allow binding messages to REAPER actions and FX learn"**

   ![Reaper OSC Configuration](https://i.imgur.com/example.png) <!-- Replace with actual screenshot if available -->

4. Click `OK` to save the device
5. Make sure the device is enabled (checkbox is checked)
6. Click `Apply` and then `OK` to save the preferences

## Creating Regions in Reaper

For the application to work properly, you need to have regions defined in your Reaper project:

1. In Reaper, position the cursor where you want a region to start
2. Press `Shift+R` or right-click on the timeline and select "Insert region"
3. Name your region (this will appear in the setlist)
4. Adjust the start and end points of the region as needed

You can create multiple regions for different parts of your project (e.g., songs, sections, etc.).

## Troubleshooting

### No Regions Found

If the application shows "No regions found in Reaper project", check the following:

1. **Reaper is Running**: Make sure Reaper is open and running
2. **OSC is Enabled**: Verify that the OSC device is enabled in Reaper's preferences
3. **Port Configuration**: Ensure the ports in Reaper's OSC configuration match the ones in the application's `.env` file
4. **Regions Exist**: Confirm that you have created regions in your Reaper project
5. **Firewall Settings**: Check if your firewall is blocking the OSC communication

### Port Conflicts

If you see errors about ports being in use:

1. **Check for Other Applications**: Make sure no other applications are using ports 8000, 9000, or 3000
2. **Restart Reaper and the Application**: Sometimes restarting both can resolve port conflicts
3. **Change Ports**: If necessary, you can change the ports in the `.env` file and in Reaper's OSC configuration

### Communication Issues

If the application can't communicate with Reaper:

1. **Check OSC Settings**: Verify all OSC settings in Reaper
2. **Restart OSC in Reaper**: Sometimes disabling and re-enabling the OSC device in Reaper can help
3. **Check Console for Errors**: Look at the browser console and server logs for specific error messages
4. **Test with Simple Commands**: Use the "Refresh Regions" button to test basic communication

## Advanced Configuration

### Using Different Ports

If you need to use different ports:

1. Edit the `.env` file in the backend directory:
   ```
   # Reaper OSC configuration
   REAPER_HOST=127.0.0.1
   REAPER_PORT=9000  # Change this to match Reaper's OSC port (where Reaper listens)
   LOCAL_PORT=8000   # Change this to match Reaper's web remote port (where Reaper sends)
   ```

2. Update the corresponding ports in Reaper's OSC configuration

### Single-Port Reaper Configuration

If your version of Reaper only allows configuring a single OSC port (without separate send/receive ports):

1. Set the single OSC port in Reaper (e.g., port 9000)
2. Configure the web remote port in Reaper (e.g., port 8000)
3. Update the `.env` file to match:
   ```
   REAPER_PORT=9000  # Match this to Reaper's OSC port
   LOCAL_PORT=8000   # Match this to Reaper's web remote port
   ```

This configuration ensures that:
- The application sends commands to the port where Reaper is listening (REAPER_PORT)
- The application listens for responses on the port where Reaper is sending (LOCAL_PORT)

### Using a Different Computer for Reaper

If Reaper is running on a different computer:

1. Update the `REAPER_HOST` in the `.env` file to the IP address of the computer running Reaper
2. Configure Reaper's OSC device to use the IP address of the computer running the application
3. Ensure both computers are on the same network and can communicate with each other
4. Check firewall settings on both computers to allow OSC communication

## Additional Resources

- [Reaper OSC Documentation](https://www.reaper.fm/sdk/osc/osc.php)
- [Default.ReaperOSC Pattern Reference](https://www.reaper.fm/sdk/osc/osc.php#pattern_based_osc)
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace Lmwares.DemoStudio
{
    public static class IsolatedDesktopHost
    {
        private const uint GenericAll = 0x10000000;
        private const uint Infinite = 0xFFFFFFFF;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct StartupInfo
        {
            public int cb;
            public string lpReserved;
            public string lpDesktop;
            public string lpTitle;
            public int dwX;
            public int dwY;
            public int dwXSize;
            public int dwYSize;
            public int dwXCountChars;
            public int dwYCountChars;
            public int dwFillAttribute;
            public int dwFlags;
            public short wShowWindow;
            public short cbReserved2;
            public IntPtr lpReserved2;
            public IntPtr hStdInput;
            public IntPtr hStdOutput;
            public IntPtr hStdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct ProcessInformation
        {
            public IntPtr hProcess;
            public IntPtr hThread;
            public int dwProcessId;
            public int dwThreadId;
        }

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr CreateDesktop(string name, IntPtr device, IntPtr devMode, uint flags, uint desiredAccess, IntPtr securityAttributes);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool CloseDesktop(IntPtr desktop);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool CreateProcess(string applicationName, StringBuilder commandLine, IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint creationFlags, IntPtr environment, string currentDirectory, ref StartupInfo startupInfo, out ProcessInformation processInformation);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr handle);

        private static string Quote(string value)
        {
            if (String.IsNullOrEmpty(value)) return "\"\"";
            if (value.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return value;
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }

        public static int LaunchAndWait(string executable, string[] arguments, string workingDirectory, string desktopName)
        {
            if (String.IsNullOrWhiteSpace(executable) || String.IsNullOrWhiteSpace(desktopName)) throw new ArgumentException("Executable and desktop name are required.");
            IntPtr desktop = CreateDesktop(desktopName, IntPtr.Zero, IntPtr.Zero, 0, GenericAll, IntPtr.Zero);
            if (desktop == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not create the isolated desktop.");
            try
            {
                var startup = new StartupInfo { cb = Marshal.SizeOf(typeof(StartupInfo)), lpDesktop = desktopName };
                ProcessInformation process;
                var command = new StringBuilder("\"" + executable + "\" " + String.Join(" ", Array.ConvertAll(arguments ?? new string[0], Quote)));
                if (!CreateProcess(executable, command, IntPtr.Zero, IntPtr.Zero, false, 0, IntPtr.Zero, workingDirectory, ref startup, out process))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not start the isolated browser process.");
                try { WaitForSingleObject(process.hProcess, Infinite); return process.dwProcessId; }
                finally { CloseHandle(process.hThread); CloseHandle(process.hProcess); }
            }
            finally { CloseDesktop(desktop); }
        }
    }
}

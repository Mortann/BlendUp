//! Restore and activate the Blender window that accepted an explicit open request.
use std::path::{Path, PathBuf};
#[cfg(target_os = "windows")]
use std::sync::atomic::{AtomicU64, Ordering};

#[cfg(target_os = "windows")]
static LATEST_OPEN_REQUEST: AtomicU64 = AtomicU64::new(0);

#[cfg(not(target_os = "windows"))]
pub fn is_running(_process_id: u32) -> bool {
    false
}

#[cfg(target_os = "windows")]
pub fn is_running(process_id: u32) -> bool {
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
        },
    };
    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id);
        if process.is_null() {
            return false;
        }
        let mut name = vec![0u16; 32768];
        let mut size = name.len() as u32;
        let found = QueryFullProcessImageNameW(process, 0, name.as_mut_ptr(), &mut size);
        CloseHandle(process);
        found != 0
            && String::from_utf16_lossy(&name[..size as usize])
                .to_lowercase()
                .ends_with("\\blender.exe")
    }
}

#[cfg(not(target_os = "windows"))]
pub fn running_process_id() -> Option<u32> {
    None
}

#[cfg(target_os = "windows")]
pub fn running_process_id() -> Option<u32> {
    use windows_sys::Win32::{
        Foundation::{HWND, LPARAM},
        UI::WindowsAndMessaging::{
            EnumWindows, GetWindow, GetWindowThreadProcessId, IsWindowVisible, GW_OWNER,
        },
    };
    unsafe extern "system" fn find(window: HWND, parameter: LPARAM) -> i32 {
        if IsWindowVisible(window) == 0 || !GetWindow(window, GW_OWNER).is_null() {
            return 1;
        }
        let mut pid = 0;
        GetWindowThreadProcessId(window, &mut pid);
        if !is_running(pid) {
            return 1;
        }
        *(parameter as *mut u32) = pid;
        0
    }
    let mut pid = 0;
    unsafe {
        EnumWindows(Some(find), &mut pid as *mut u32 as LPARAM);
    }
    (pid != 0).then_some(pid)
}

pub fn focus_when_ready(process_id: Option<u32>, target: PathBuf) {
    #[cfg(target_os = "windows")]
    {
        let request = LATEST_OPEN_REQUEST.fetch_add(1, Ordering::Relaxed) + 1;
        std::thread::spawn(move || {
            for _ in 0..60 {
                // A slow launch must not take focus from a newer asset request.
                if LATEST_OPEN_REQUEST.load(Ordering::Relaxed) != request
                    || focus(process_id, &target)
                {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(250));
            }
        });
    }
    #[cfg(not(target_os = "windows"))]
    let _ = (process_id, target);
}

#[cfg(not(target_os = "windows"))]
pub fn focus(_process_id: Option<u32>, _target: &Path) -> bool {
    false
}

#[cfg(target_os = "windows")]
pub fn focus(process_id: Option<u32>, target: &Path) -> bool {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, HWND, LPARAM},
        System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
        },
        UI::WindowsAndMessaging::{
            AllowSetForegroundWindow, EnumWindows, FlashWindowEx, GetWindow, GetWindowTextW,
            GetWindowThreadProcessId, IsIconic, IsWindowVisible, SetForegroundWindow,
            ShowWindowAsync, FLASHWINFO, FLASHW_TRAY, GW_OWNER, SW_RESTORE,
        },
    };

    struct Search {
        process_id: Option<u32>,
        file_name: String,
        window: HWND,
        matched_pid: u32,
    }
    unsafe extern "system" fn find_window(window: HWND, parameter: LPARAM) -> i32 {
        let search = &mut *(parameter as *mut Search);
        if IsWindowVisible(window) == 0 || !GetWindow(window, GW_OWNER).is_null() {
            return 1;
        }
        let mut pid = 0;
        GetWindowThreadProcessId(window, &mut pid);
        if search.process_id.is_some_and(|expected| expected != pid) {
            return 1;
        }
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if process.is_null() {
            return 1;
        }
        let mut image = vec![0u16; 32768];
        let mut size = image.len() as u32;
        let found = QueryFullProcessImageNameW(process, 0, image.as_mut_ptr(), &mut size);
        CloseHandle(process);
        if found == 0
            || !String::from_utf16_lossy(&image[..size as usize])
                .to_lowercase()
                .ends_with("\\blender.exe")
        {
            return 1;
        }
        let mut title = [0u16; 4096];
        let length = GetWindowTextW(window, title.as_mut_ptr(), title.len() as i32);
        // Waiting for the filename also avoids activating Blender's splash
        // screen before a newly launched instance has loaded the requested file.
        if length <= 0
            || !String::from_utf16_lossy(&title[..length as usize])
                .to_lowercase()
                .contains(&search.file_name)
        {
            return 1;
        }
        search.window = window;
        search.matched_pid = pid;
        0
    }

    // An acknowledged session may still show the save confirmation, with its old title.
    let file_name = match target.file_name().and_then(|value| value.to_str()) {
        Some(name) => name,
        None if process_id.is_some() => "",
        None => return false,
    };
    let mut search = Search {
        process_id,
        file_name: file_name.to_lowercase(),
        window: std::ptr::null_mut(),
        matched_pid: 0,
    };
    unsafe {
        EnumWindows(Some(find_window), &mut search as *mut Search as LPARAM);
        if search.window.is_null() {
            return false;
        }
        AllowSetForegroundWindow(search.matched_pid);
        if IsIconic(search.window) != 0 {
            ShowWindowAsync(search.window, SW_RESTORE);
        }
        if SetForegroundWindow(search.window) != 0 {
            return true;
        }
        // Respect Windows focus rules when the user has already switched apps.
        let info = FLASHWINFO {
            cbSize: std::mem::size_of::<FLASHWINFO>() as u32,
            hwnd: search.window,
            dwFlags: FLASHW_TRAY,
            uCount: 3,
            dwTimeout: 0,
        };
        FlashWindowEx(&info);
    }
    true
}

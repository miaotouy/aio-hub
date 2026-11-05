use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::sync::atomic::{AtomicUsize, Ordering};
static FREED: AtomicUsize = AtomicUsize::new(0);
#[no_mangle]
pub unsafe extern "C" fn call(method: *const c_char, payload: *const c_char) -> *mut c_char {
    let method = CStr::from_ptr(method).to_str().unwrap();
    let payload = CStr::from_ptr(payload).to_str().unwrap();
    if method == "crash" {
        std::process::abort();
    }
    if method == "null" {
        return std::ptr::null_mut();
    }
    if method == "sleep" {
        std::thread::sleep(std::time::Duration::from_millis(payload.parse().unwrap()));
    }
    if method == "count" {
        return CString::new(FREED.load(Ordering::SeqCst).to_string())
            .unwrap()
            .into_raw();
    }
    if method == "invalid" {
        return CString::from_vec_unchecked(vec![0xff]).into_raw();
    }
    if method == "large" {
        return CString::new("a".repeat(16 * 1024 * 1024 + 1))
            .unwrap()
            .into_raw();
    }
    CString::new(payload).unwrap().into_raw()
}
#[no_mangle]
pub unsafe extern "C" fn free_string(ptr: *mut c_char) {
    drop(CString::from_raw(ptr));
    FREED.fetch_add(1, Ordering::SeqCst);
}

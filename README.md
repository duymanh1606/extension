# Outlook Auto-Login & OTP Notifier (Manifest V3)

Extension tự động hóa quy trình đăng nhập Outlook/Microsoft, theo dõi hòm thư ngầm và bóc tách mã xác thực OTP với thông báo tức thì lên màn hình và tự động sao chép vào Clipboard.

---

## 🌟 Tính Năng Nổi Bật

1. **⚡ Quick Paste Thông Minh:** Hỗ trợ dán nhanh chuỗi tài khoản `email|password`, `email:password`, `email;password`, `email\tpassword` tự động tách thành 2 ô riêng biệt.
2. **🧹 Xóa Sạch Phiên Đăng Nhập Cũ (Cookies):** Sử dụng cả `chrome.cookies` và `chrome.browsingData` để xóa sạch cookie của Microsoft/Outlook trước khi bắt đầu, ngăn ngừa tình trạng kẹt tài khoản cũ.
3. **🤫 Chạy Ngầm Tinh Tế:** Tự động mở tab Outlook ở chế độ ghim chạy ngầm (`pinned: true`, `active: false`), không làm gián đoạn công việc của người dùng trên tab hiện tại.
4. **🤖 Tự Động Vượt Màn Hình Đăng Nhập:**
   - Điền Email & Mật khẩu tương thích React/KnockoutJS (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set`).
   - Tự động bỏ qua các màn hình phụ: "Stay signed in?" (Duy trì đăng nhập), "Break free from passwords", "Passkey", "Protect your account" (Skip for now).
5. **🔍 Bóc Tách OTP Đa Tầng Thông Minh:**
   - Quét cả Hộp thư đến (Inbox) và Khung đọc thư (Reading Pane).
   - Tự động click vào thư mới nhất để mở nội dung chi tiết.
   - Nhận diện ngữ cảnh và Regex bóc tách mã 4-8 chữ số, lọc bỏ năm sinh hoặc mã màu hex.
   - **Cơ chế Fallback:** Nếu sau 12 giây không có mã ở Inbox, tự động chuyển sang quét mục **Junk Email (Thư rác)**.
6. **🚀 Thông Báo Kép & Auto-Copy:**
   - **System Notification:** Thông báo hệ thống với thuộc tính `requireInteraction: true` và nút "Sao chép mã OTP".
   - **Floating Toast UI (Shadow DOM):** Khung nổi góc trên bên phải màn hình tab người dùng đang xem, độc lập style với website hiện tại, kèm nút copy và tự động ghi thẳng vào Clipboard.
   - **Popup Status & History:** Hiển thị mã OTP to rõ ngay trên Popup và lưu lịch sử các mã đã lấy gần đây.

---

## 🚀 Hướng Dẫn Cài Đặt (Load Unpacked)

1. Mở trình duyệt Google Chrome (hoặc Edge / Brave / Cốc Cốc).
2. Truy cập vào đường dẫn: `chrome://extensions`
3. Bật công tắc **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
4. Bấm nút **Load unpacked** (Tải tiện ích đã giải nén).
5. Chọn thư mục:
   ```
   /home/duymanh/code/extension
   ```
6. Extension sẽ xuất hiện trên thanh công cụ với biểu tượng logo màu xanh Outlook.

---

## 🧪 Hướng Dẫn Sử Dụng & Kiểm Thử

1. Bấm vào icon Extension trên thanh công cụ để mở Popup.
2. Dán tài khoản theo định dạng:
   `your_email@outlook.com|your_password`
   *(Hệ thống sẽ tự tách email và mật khẩu).*
3. Bấm **Đăng nhập & Lấy OTP**:
   - Extension sẽ xóa cookie cũ và mở 1 tab Outlook chạy ngầm.
   - Theo dõi trạng thái realtime trên Popup:
     - *Đang xóa sạch cookie phiên cũ...*
     - *Đang điền tài khoản Outlook...*
     - *Đang điền mật khẩu...*
     - *Đang theo dõi Hộp thư đến (Inbox)...*
   - Khi có email OTP gửi về:
     - Mã OTP sẽ được tự động copy vào Clipboard.
     - Khung Toast nổi bật xuất hiện ở góc trên bên phải màn hình tab bạn đang đọc.
     - Thông báo hệ thống xuất hiện ở góc màn hình.
     - Tab Outlook chạy ngầm sẽ tự động đóng sau 2 giây (nếu bật tùy chọn tự đóng tab).
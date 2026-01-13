import sys
import os
import pyautogui
import pyperclip
import pandas as pd
import time
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QLabel, QLineEdit, QTableWidget, QTableWidgetItem,
    QHeaderView, QMessageBox, QFileDialog, QSpinBox, QCheckBox, QKeySequenceEdit,
    QStyleOptionSpinBox
)
from PyQt6.QtCore import Qt, QThread, pyqtSignal, QTimer, QRect, QPointF
from PyQt6.QtGui import QFont, QColor, QPalette, QKeySequence, QPainter, QPen, QPolygonF, QIcon
import keyboard
from pynput import mouse

def resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

class CustomSpinBox(QSpinBox):
    """Custom SpinBox that draws up/down arrow symbols on buttons"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setButtonSymbols(QSpinBox.ButtonSymbols.UpDownArrows)
        self.pressed_button = None  # Track which button is pressed
    
    def mousePressEvent(self, event):
        # Detect which button was clicked
        opt = QStyleOptionSpinBox()
        self.initStyleOption(opt)
        style = self.style()
        
        up_rect = style.subControlRect(style.ComplexControl.CC_SpinBox, opt, style.SubControl.SC_SpinBoxUp, self)
        down_rect = style.subControlRect(style.ComplexControl.CC_SpinBox, opt, style.SubControl.SC_SpinBoxDown, self)
        
        if up_rect.contains(event.pos()):
            self.pressed_button = "up"
        elif down_rect.contains(event.pos()):
            self.pressed_button = "down"
        else:
            self.pressed_button = None
        
        self.update()  # Trigger repaint
        super().mousePressEvent(event)
    
    def mouseReleaseEvent(self, event):
        self.pressed_button = None
        self.update()  # Trigger repaint
        super().mouseReleaseEvent(event)
    
    def paintEvent(self, event):
        # เรียกใช้ default paint เพื่อจัดการโครงสร้างพื้นฐาน
        super().paintEvent(event)
        
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        
        opt = QStyleOptionSpinBox()
        self.initStyleOption(opt)
        style = self.style()
        
        # ดึงตำแหน่งของปุ่ม Up และ Down
        up_rect = style.subControlRect(style.ComplexControl.CC_SpinBox, opt, style.SubControl.SC_SpinBoxUp, self)
        down_rect = style.subControlRect(style.ComplexControl.CC_SpinBox, opt, style.SubControl.SC_SpinBoxDown, self)
        
        # ระบายพื้นหลังปุ่มพร้อม feedback เมื่อกด
        bg_color = QColor("#2d2d30")
        pressed_color = QColor("#007acc")  # สีน้ำเงินเมื่อกด
        
        if self.pressed_button == "up":
            painter.fillRect(up_rect, pressed_color)
            painter.fillRect(down_rect, bg_color)
        elif self.pressed_button == "down":
            painter.fillRect(up_rect, bg_color)
            painter.fillRect(down_rect, pressed_color)
        else:
            painter.fillRect(up_rect, bg_color)
            painter.fillRect(down_rect, bg_color)
        
        # ตั้งค่าสีและแปรงสำหรับวาดลูกศร
        arrow_color = QColor("#cccccc")
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(arrow_color)
        
        # ฟังก์ชันช่วยวาดสามเหลี่ยมให้เล็กและแหลม
        def draw_triangle(rect, direction="up"):
            # ปรับให้ลูกศรเล็กลงมาก
            margin_w = rect.width() * 0.35  # ลูกศรแคบลง
            margin_h = rect.height() * 0.35  # ลูกศรเตี้ยลง
            inner = rect.adjusted(int(margin_w), int(margin_h), int(-margin_w), int(-margin_h))
            
            if direction == "up":
                points = [
                    QPointF(inner.bottomLeft()),
                    QPointF(inner.bottomRight()),
                    QPointF(inner.center().x(), inner.top())
                ]
            else:
                points = [
                    QPointF(inner.topLeft()),
                    QPointF(inner.topRight()),
                    QPointF(inner.center().x(), inner.bottom())
                ]
            painter.drawPolygon(QPolygonF(points))
        
        # วาดลูกศรบนและล่าง
        draw_triangle(up_rect, "up")
        draw_triangle(down_rect, "down")
        
        painter.end()

class PositionPicker(QThread):
    """Thread for picking screen position with mouse click"""
    position_picked = pyqtSignal(tuple)
    
    def __init__(self):
        super().__init__()
        self.running = True
        self.listener = None
    
    def run(self):
        def on_click(x, y, button, pressed):
            if pressed and self.running:
                self.position_picked.emit((x, y))
                return False  # Stop listener
        
        # Start mouse listener
        with mouse.Listener(on_click=on_click) as self.listener:
            self.listener.join()
    
    def stop(self):
        self.running = False
        if self.listener:
            self.listener.stop()

class ExtractorThread(QThread):
    """Thread for extracting keyframe data"""
    data_extracted = pyqtSignal(dict)
    extraction_complete = pyqtSignal()
    error_occurred = pyqtSignal(str)
    
    def __init__(self, fields, next_key, total_keyframes):
        super().__init__()
        self.fields = fields
        self.next_key = next_key
        self.total_keyframes = total_keyframes
        self.running = True
    
    def get_value_from_field(self, coords):
        """Double-clicks the field, copies its value, and returns the clipboard content."""
        try:
            # Double-click to select the field
            pyautogui.doubleClick(coords)
            time.sleep(0.1)
            
            # Select all text in the field
            pyautogui.hotkey('ctrl', 'a')
            
            # Copy the selected text
            pyautogui.hotkey('ctrl', 'c')
            time.sleep(0.2)  # Allow time for the clipboard to update
            
            # Press ESC to deselect
            pyautogui.hotkey('esc')
            time.sleep(0.1)
            
            # Get the clipboard content
            value = pyperclip.paste()
            return value if value else ""
        except Exception as e:
            print(f"Error getting value from field: {e}")
            return ""
    
    def run(self):
        try:
            for i in range(self.total_keyframes):
                if not self.running:
                    break
                
                row_data = {"Keyframe_Index": i + 1}
                
                # Retrieve values from each field
                for field_name, coords in self.fields.items():
                    val = self.get_value_from_field(coords)
                    row_data[field_name] = val
                    print(f"Keyframe {i+1}, {field_name}: {val}")  # Debug output
                
                self.data_extracted.emit(row_data)
                
                # Advance to the next keyframe (except for the last one)
                if i < self.total_keyframes - 1:
                    # Parse key sequence and execute
                    # Format can be like "F9", "Ctrl+P", "Shift+F9", etc.
                    keys = self.next_key.lower().replace(' ', '')
                    
                    # Split by + to get modifiers and key
                    parts = keys.split('+')
                    
                    # Check if it's a simple single key
                    if len(parts) == 1:
                        pyautogui.press(keys)
                    else:
                        # It's a combination, use hotkey
                        pyautogui.hotkey(*parts)
                    
                    time.sleep(0.6)  # เพิ่มเวลารอให้หน้าจออัปเดต
            
            self.extraction_complete.emit()
            print("Extraction completed successfully")
        except Exception as e:
            print(f"Extraction error: {e}")
            self.error_occurred.emit(str(e))
    
    def stop(self):
        self.running = False

class CameraExtractorApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.fields = {
            "Position_X": (0, 0),
            "Position_Y": (0, 0),
            "Scale": (0, 0),
            "Rotation": (0, 0)
        }
        self.next_keyframe_button = "F9"
        self.data = []
        self.extractor_thread = None
        
        self.init_ui()
        self.apply_dark_theme()
    
    def init_ui(self):
        self.setWindowTitle("Camera Keyframe Extractor")
        self.setWindowIcon(QIcon(resource_path('app_icon.ico')))
        self.setGeometry(100, 100, 900, 650)
        
        # Central widget
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        main_layout.setSpacing(10)
        main_layout.setContentsMargins(15, 15, 15, 15)
        
        # Header with title and always on top
        header_layout = QHBoxLayout()
        
        title = QLabel("Camera Keyframe Extractor")
        title.setFont(QFont("Segoe UI", 14, QFont.Weight.Bold))
        
        self.always_on_top_checkbox = QCheckBox("Always on Top")
        self.always_on_top_checkbox.setFont(QFont("Segoe UI", 9))
        self.always_on_top_checkbox.stateChanged.connect(self.toggle_always_on_top)
        
        header_layout.addWidget(title)
        header_layout.addStretch()
        header_layout.addWidget(self.always_on_top_checkbox)
        
        main_layout.addLayout(header_layout)
        
        # Field Position Configuration
        field_group = QWidget()
        field_layout = QVBoxLayout(field_group)
        field_layout.setSpacing(8)
        field_layout.setContentsMargins(0, 5, 0, 5)
        
        field_label = QLabel("Field Positions")
        field_label.setFont(QFont("Segoe UI", 11, QFont.Weight.Bold))
        field_layout.addWidget(field_label)
        
        # Buttons row
        buttons_row = QHBoxLayout()
        buttons_row.setSpacing(10)
        
        # Labels row
        labels_row = QHBoxLayout()
        labels_row.setSpacing(10)
        
        self.field_buttons = {}
        self.field_labels = {}
        
        for field_name in ["Position_X", "Position_Y", "Scale", "Rotation"]:
            # Create vertical layout for each field (button + label)
            field_col = QVBoxLayout()
            field_col.setSpacing(4)
            
            btn = QPushButton(f"Select {field_name}")
            btn.setMinimumHeight(32)
            btn.setMinimumWidth(140)
            btn.setFont(QFont("Segoe UI", 9))
            btn.clicked.connect(lambda checked, fn=field_name: self.select_field_position(fn))
            
            label = QLabel("(0, 0)")
            label.setFont(QFont("Consolas", 9))
            label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            
            self.field_buttons[field_name] = btn
            self.field_labels[field_name] = label
            
            field_col.addWidget(btn)
            field_col.addWidget(label)
            
            buttons_row.addLayout(field_col)
        
        buttons_row.addStretch()
        field_layout.addLayout(buttons_row)
        
        main_layout.addWidget(field_group)
        
        # Settings
        settings_group = QWidget()
        settings_layout = QHBoxLayout(settings_group)
        settings_layout.setSpacing(15)
        
        # Total Keyframes
        keyframe_label = QLabel("Total Keyframes:")
        keyframe_label.setFont(QFont("Segoe UI", 9))
        self.keyframe_input = CustomSpinBox()
        self.keyframe_input.setMinimum(1)
        self.keyframe_input.setMaximum(1000)
        self.keyframe_input.setValue(4)
        self.keyframe_input.setMinimumHeight(28)
        self.keyframe_input.setMaximumWidth(80)
        self.keyframe_input.setFont(QFont("Segoe UI", 9))
        
        # Next Keyframe Button using QKeySequenceEdit
        next_key_label = QLabel("Next Key:")
        next_key_label.setFont(QFont("Segoe UI", 9))
        self.next_key_edit = QKeySequenceEdit()
        self.next_key_edit.setKeySequence(QKeySequence("F9"))
        self.next_key_edit.setMinimumHeight(28)
        self.next_key_edit.setMinimumWidth(120)
        self.next_key_edit.setMaximumWidth(180)
        self.next_key_edit.setFont(QFont("Segoe UI", 9))
        self.next_key_edit.editingFinished.connect(self.on_key_sequence_changed)
        
        settings_layout.addWidget(keyframe_label)
        settings_layout.addWidget(self.keyframe_input)
        settings_layout.addSpacing(20)
        settings_layout.addWidget(next_key_label)
        settings_layout.addWidget(self.next_key_edit)
        settings_layout.addStretch()
        
        main_layout.addWidget(settings_group)
        
        # Control Buttons
        control_layout = QHBoxLayout()
        control_layout.setSpacing(8)
        
        self.start_btn = QPushButton("Start Extraction")
        self.start_btn.setMinimumHeight(36)
        self.start_btn.setFont(QFont("Segoe UI", 10, QFont.Weight.Bold))
        self.start_btn.clicked.connect(self.start_extraction)
        
        self.stop_btn = QPushButton("Stop")
        self.stop_btn.setMinimumHeight(36)
        self.stop_btn.setFont(QFont("Segoe UI", 10))
        self.stop_btn.setEnabled(False)
        self.stop_btn.clicked.connect(self.stop_extraction)
        
        self.clear_btn = QPushButton("Clear Data")
        self.clear_btn.setMinimumHeight(36)
        self.clear_btn.setFont(QFont("Segoe UI", 10))
        self.clear_btn.clicked.connect(self.clear_data)
        
        self.export_btn = QPushButton("Export CSV")
        self.export_btn.setMinimumHeight(36)
        self.export_btn.setFont(QFont("Segoe UI", 10, QFont.Weight.Bold))
        self.export_btn.clicked.connect(self.export_csv)
        
        control_layout.addWidget(self.start_btn, 2)
        control_layout.addWidget(self.stop_btn, 1)
        control_layout.addWidget(self.clear_btn, 1)
        control_layout.addWidget(self.export_btn, 2)
        
        main_layout.addLayout(control_layout)
        
        # Status Label
        self.status_label = QLabel("Ready")
        self.status_label.setFont(QFont("Segoe UI", 9))
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.status_label.setMinimumHeight(24)
        main_layout.addWidget(self.status_label)
        
        # Data Table
        table_label = QLabel("Extracted Data")
        table_label.setFont(QFont("Segoe UI", 11, QFont.Weight.Bold))
        main_layout.addWidget(table_label)
        
        self.table = QTableWidget()
        self.table.setColumnCount(5)
        self.table.setHorizontalHeaderLabels(["FRAME", "X", "Y", "S", "R"])
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.table.setFont(QFont("Segoe UI", 9))
        self.table.setAlternatingRowColors(True)
        self.table.verticalHeader().setDefaultSectionSize(28)
        main_layout.addWidget(self.table)
    
    def apply_dark_theme(self):
        """Apply professional dark theme similar to the reference image"""
        self.setStyleSheet("""
            QMainWindow {
                background-color: #1e1e1e;
            }
            QWidget {
                background-color: #1e1e1e;
                color: #cccccc;
            }
            QLabel {
                color: #cccccc;
            }
            QPushButton {
                background-color: #2d2d30;
                color: #cccccc;
                border: 1px solid #3e3e42;
                border-radius: 3px;
                padding: 6px 12px;
            }
            QPushButton:hover {
                background-color: #3e3e42;
                border: 1px solid #007acc;
            }
            QPushButton:pressed {
                background-color: #007acc;
            }
            QPushButton:disabled {
                background-color: #252526;
                color: #656565;
                border: 1px solid #3e3e42;
            }
            QPushButton#start {
                background-color: #0e639c;
                border: 1px solid #1177bb;
            }
            QPushButton#start:hover {
                background-color: #1177bb;
            }
            QPushButton#export {
                background-color: #0e639c;
                border: 1px solid #1177bb;
            }
            QPushButton#export:hover {
                background-color: #1177bb;
            }
            QCheckBox {
                color: #cccccc;
                spacing: 6px;
            }
            QCheckBox::indicator {
                width: 16px;
                height: 16px;
                border: 1px solid #3e3e42;
                border-radius: 3px;
                background-color: #2d2d30;
            }
            QCheckBox::indicator:checked {
                background-color: #007acc;
                border: 1px solid #007acc;
            }
            QCheckBox::indicator:hover {
                border: 1px solid #007acc;
            }
            QLineEdit, QSpinBox {
                background-color: #2d2d30;
                color: #cccccc;
                border: 1px solid #3e3e42;
                border-radius: 3px;
                padding: 4px 8px;
            }
            QLineEdit:focus, QSpinBox:focus {
                border: 1px solid #007acc;
            }
            QKeySequenceEdit {
                background-color: #2d2d30;
                color: #cccccc;
                border: 1px solid #3e3e42;
                border-radius: 3px;
                padding: 4px 8px;
            }
            QKeySequenceEdit:focus {
                border: 1px solid #007acc;
            }
            QSpinBox::up-button, QSpinBox::down-button {
                background-color: #2d2d30;
                border: 1px solid #3e3e42;
                width: 18px;
                height: 14px;
                subcontrol-origin: border;
            }
            QSpinBox::up-button {
                subcontrol-position: top right;
            }
            QSpinBox::down-button {
                subcontrol-position: bottom right;
            }
            QSpinBox::up-button:hover, QSpinBox::down-button:hover {
                background-color: #3e3e42;
            }
            QTableWidget {
                background-color: #252526;
                color: #cccccc;
                gridline-color: #3e3e42;
                border: 1px solid #3e3e42;
                border-radius: 0px;
            }
            QTableWidget::item {
                padding: 4px;
                border: none;
            }
            QTableWidget::item:selected {
                background-color: #094771;
            }
            QTableWidget::item:alternate {
                background-color: #2a2a2d;
            }
            QHeaderView::section {
                background-color: #2d2d30;
                color: #cccccc;
                padding: 6px;
                border: none;
                border-right: 1px solid #3e3e42;
                border-bottom: 1px solid #3e3e42;
                font-weight: bold;
            }
            QHeaderView::section:hover {
                background-color: #3e3e42;
            }
        """)
        
        self.start_btn.setObjectName("start")
        self.export_btn.setObjectName("export")
    
    def toggle_always_on_top(self, state):
        """Toggle always on top window flag"""
        if state == Qt.CheckState.Checked.value:
            self.setWindowFlag(Qt.WindowType.WindowStaysOnTopHint, True)
        else:
            self.setWindowFlag(Qt.WindowType.WindowStaysOnTopHint, False)
        self.show()
    
    def select_field_position(self, field_name):
        """Start position picking for a specific field"""
        self.status_label.setText(f"Click anywhere on screen to set {field_name} position...")
        self.status_label.setStyleSheet("color: #14b8a6;")
        
        # Minimize window to allow clicking
        self.showMinimized()
        
        # Start position picker thread
        picker = PositionPicker()
        picker.position_picked.connect(lambda pos: self.on_position_picked(field_name, pos))
        picker.start()
        
        # Store reference to prevent garbage collection
        self.current_picker = picker
    
    def on_position_picked(self, field_name, position):
        """Handle position picked"""
        self.fields[field_name] = position
        self.field_labels[field_name].setText(f"({position[0]}, {position[1]})")
        self.status_label.setText(f"{field_name} position set to {position}")
        self.status_label.setStyleSheet("color: #10b981;")
        
        # Restore window
        self.showNormal()
        self.activateWindow()
    
    def on_key_sequence_changed(self):
        """Handle key sequence change from QKeySequenceEdit"""
        key_sequence = self.next_key_edit.keySequence()
        self.next_keyframe_button = key_sequence.toString()
        self.status_label.setText(f"Next Keyframe key set to '{self.next_keyframe_button}'")
        self.status_label.setStyleSheet("color: #10b981;")
    
    def start_extraction(self):
        """Start the extraction process"""
        # Validate positions
        if any(pos == (0, 0) for pos in self.fields.values()):
            QMessageBox.warning(self, "Warning", "Please set all field positions first!")
            return
        
        total_keyframes = self.keyframe_input.value()
        
        self.status_label.setText("Extracting data... Please keep CSP visible!")
        self.status_label.setStyleSheet("color: #f59e0b;")
        
        self.start_btn.setEnabled(False)
        self.stop_btn.setEnabled(True)
        
        # Clear previous data
        self.data = []
        self.table.setRowCount(0)
        
        # Minimize window
        QTimer.singleShot(2000, self.showMinimized)
        
        # Start extraction thread
        self.extractor_thread = ExtractorThread(self.fields, self.next_keyframe_button, total_keyframes)
        self.extractor_thread.data_extracted.connect(self.on_data_extracted)
        self.extractor_thread.extraction_complete.connect(self.on_extraction_complete)
        self.extractor_thread.error_occurred.connect(self.on_error)
        
        QTimer.singleShot(2000, self.extractor_thread.start)
    
    def stop_extraction(self):
        """Stop the extraction process"""
        if self.extractor_thread:
            self.extractor_thread.stop()
        
        self.start_btn.setEnabled(True)
        self.stop_btn.setEnabled(False)
        self.status_label.setText("Extraction stopped by user")
        self.status_label.setStyleSheet("color: #ef4444;")
        self.showNormal()
    
    def on_data_extracted(self, row_data):
        """Handle extracted data (real-time update)"""
        self.data.append(row_data)
        
        # Add to table
        row_position = self.table.rowCount()
        self.table.insertRow(row_position)
        
        # FRAME
        self.table.setItem(row_position, 0, QTableWidgetItem(str(row_data["Keyframe_Index"])))
        # X
        self.table.setItem(row_position, 1, QTableWidgetItem(row_data.get("Position_X", "")))
        # Y
        self.table.setItem(row_position, 2, QTableWidgetItem(row_data.get("Position_Y", "")))
        # S
        self.table.setItem(row_position, 3, QTableWidgetItem(row_data.get("Scale", "")))
        # R
        self.table.setItem(row_position, 4, QTableWidgetItem(row_data.get("Rotation", "")))
        
        self.status_label.setText(f"Extracted keyframe {row_data['Keyframe_Index']}")
    
    def on_extraction_complete(self):
        """Handle extraction completion"""
        self.start_btn.setEnabled(True)
        self.stop_btn.setEnabled(False)
        self.status_label.setText(f"Extraction complete! Total keyframes: {len(self.data)}")
        self.status_label.setStyleSheet("color: #10b981;")
        self.showNormal()
        self.activateWindow()
    
    def on_error(self, error_msg):
        """Handle extraction error"""
        self.start_btn.setEnabled(True)
        self.stop_btn.setEnabled(False)
        self.status_label.setText(f"Error: {error_msg}")
        self.status_label.setStyleSheet("color: #ef4444;")
        self.showNormal()
        QMessageBox.critical(self, "Error", f"An error occurred:\n{error_msg}")
    
    def clear_data(self):
        """Clear all extracted data"""
        reply = QMessageBox.question(
            self, "Confirm Clear",
            "Are you sure you want to clear all data?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            self.data = []
            self.table.setRowCount(0)
            self.status_label.setText("Data cleared")
            self.status_label.setStyleSheet("color: #cccccc;")
    
    def export_csv(self):
        """Export data to CSV with the exact format from sc_camera.csv"""
        if not self.data:
            QMessageBox.warning(self, "Warning", "No data to export!")
            return
        
        # Get data from table (in case user edited it)
        export_data = []
        for row in range(self.table.rowCount()):
            frame = self.table.item(row, 0).text()
            x = self.table.item(row, 1).text()
            y = self.table.item(row, 2).text()
            s = self.table.item(row, 3).text()
            r = self.table.item(row, 4).text()
            export_data.append({
                "FRAME": frame,
                "X": x,
                "Y": y,
                "S": s,
                "R": r
            })
        
        # Open save dialog
        file_path, _ = QFileDialog.getSaveFileName(
            self, "Save CSV File",
            "camera_keyframes.csv",
            "CSV Files (*.csv)"
        )
        
        if file_path:
            try:
                df = pd.DataFrame(export_data)
                df.to_csv(file_path, index=False)
                self.status_label.setText(f"Data exported to {file_path}")
                self.status_label.setStyleSheet("color: #10b981;")
                QMessageBox.information(self, "Success", f"Data exported successfully to:\n{file_path}")
            except Exception as e:
                QMessageBox.critical(self, "Error", f"Failed to export data:\n{str(e)}")

def main():
    app = QApplication(sys.argv)
    app.setStyle('Fusion')
    
    window = CameraExtractorApp()
    window.show()
    
    sys.exit(app.exec())

if __name__ == "__main__":
    main()

"""Synthetic BIFF8 fixture, generated independently with xlwt 1.3.0.

Run with an environment containing xlwt. No real student data is used.
"""
from pathlib import Path
import xlwt

book = xlwt.Workbook()
book.add_sheet('说明').write(0, 0, '合成测试名册，不含真实学生信息')
sheet = book.add_sheet('课程名单')
sheet.write(0, 0, '合成课程名单')
headers = ['班级名称', '序号', '姓名', '学号', '数据来源', '院系', '邮箱地址', '加入时间']
for c, value in enumerate(headers):
    sheet.write(2, c, value)
for i in range(400):
    values = ['测试教学班', i + 1, f'测试同学{i:03d}甲乙丙丁', f'{i + 1:08d}',
              '合成数据', '测试院系', f'fixture{i}@example.invalid', '2026-09-24']
    if i == 1:
        values[3] = 20260002  # Numeric identifiers alongside leading-zero text.
    if i == 2:
        values[2] = '<img src=x onerror=alert(1)>'
    for c, value in enumerate(values):
        sheet.write(i + 3, c, value)
book.add_sheet('空白表')
book.save(str(Path(__file__).with_name('legacy-roster.xls')))

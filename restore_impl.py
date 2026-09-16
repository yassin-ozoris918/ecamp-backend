import re

service_file = 'src/quizzes/quizzes.service.ts'
new_submit = 'C:/Users/user/.gemini/antigravity-ide/brain/0d88ad3e-44ae-4656-b232-4798de26bb62/scratch/new_submit_quiz.ts'
admin_methods = 'C:/Users/user/.gemini/antigravity-ide/brain/0d88ad3e-44ae-4656-b232-4798de26bb62/scratch/admin_methods.ts'
repair_add = 'C:/Users/user/.gemini/antigravity-ide/brain/0d88ad3e-44ae-4656-b232-4798de26bb62/scratch/repair_add_question.ts'

with open(service_file, 'r', encoding='utf-8') as f:
    orig = f.read()

with open(new_submit, 'r', encoding='utf-8') as f:
    submit_code = f.read()

with open(admin_methods, 'r', encoding='utf-8') as f:
    admin_code = f.read()
    
with open(repair_add, 'r', encoding='utf-8') as f:
    repair_code = f.read()

# Replace addQuestion and abandonQuiz
orig = re.sub(r'async addQuestion.*?async abandonQuiz.*?\n  }', repair_code, orig, flags=re.DOTALL)

# Replace submitQuiz
orig = re.sub(r'async submitQuiz\(dto: SubmitQuizDto, studentId: string\) \{.*?async surrenderQuiz', submit_code + '\n\n  async surrenderQuiz', orig, flags=re.DOTALL)

# Insert admin methods before resumeLectureAccess
orig = orig.replace('private async resumeLectureAccess', admin_code + '\n\n  private async resumeLectureAccess')

with open(service_file, 'w', encoding='utf-8') as f:
    f.write(orig)

print('Restored implementation successfully.')

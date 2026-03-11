"""Quick test runner that writes results to a file"""
import subprocess
import sys
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

result = subprocess.run(
    [sys.executable, '-m', 'pytest', 'tests/', '--tb=short', '-q',
     '-W', 'ignore::DeprecationWarning'],
    capture_output=True,
    text=True,
    timeout=300
)

output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'test_results.txt')
with open(output_path, 'w') as f:
    f.write("=== STDOUT ===\n")
    f.write(result.stdout)
    f.write("\n=== STDERR (last 300 chars) ===\n")
    f.write(result.stderr[-300:] if result.stderr else "(none)")
    f.write(f"\n=== RETURN CODE: {result.returncode} ===\n")

print(f"Results written to {output_path}")
print(f"Return code: {result.returncode}")
# Print last 5 lines of stdout
lines = result.stdout.strip().split('\n')
for line in lines[-5:]:
    print(line)

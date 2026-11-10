"""Every test runs on the sample library (sample_library.py), made once in a temporary folder before glossator
is imported: GLOSSATOR_HOME points the tool there, so build/ and library/ are the sample's, never one's own."""

import atexit
import os
import shutil
import tempfile
from pathlib import Path

import sample_library

HOME = Path(tempfile.mkdtemp(prefix="glossator-tests-"))
sample_library.make(HOME / "library")
os.environ["GLOSSATOR_HOME"] = str(HOME)
os.environ["GLOSSATOR_ZOTERO_KEY"] = str(HOME / "no-zotero-key")  # never a real key: nothing goes to zotero.org
os.environ.pop("GLOSSATOR_LIBRARY", None)
os.environ.pop("GLOSSATOR_ROOT", None)
atexit.register(shutil.rmtree, HOME, ignore_errors=True)

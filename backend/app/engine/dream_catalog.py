"""Curated India catalog. Amounts are domestic program fees at standard duration."""

from dataclasses import dataclass
from typing import Literal

Subject = Literal["data", "software", "electronics", "business", "finance", "design", "media", "psychology"]
Level = Literal["undergraduate", "postgraduate"]
Mode = Literal["online", "distance", "hybrid", "campus"]
CATALOG_REVIEWED = "2026-11-27"


@dataclass(frozen=True)
class Program:
    id: str
    title: str
    institution: str
    subjects: tuple[Subject, ...]
    level: Level
    mode: Mode
    duration_months: int
    fees_inr: tuple[int, int] | None
    fit: str
    requirements: str
    next_step: str
    sources: tuple[tuple[str, str], ...]
    requires_physics_and_math: bool = False


CATALOG = (
    Program(
        "iitm-data", "BS in Data Science and Applications", "IIT Madras", ("data", "software"),
        "undergraduate", "hybrid", 48, (386_000, 450_000),
        "Combines statistics, programming and machine learning, with project work and optional interim exit awards.",
        "Class 12 or equivalent to enroll, plus the applicable qualifier or entry route. Coursework is online and assessments include in-person exams.",
        "Check the qualifier and locate an exam centre. Review the published fee-waiver criteria before setting your budget.",
        (("Admissions", "https://study.iitm.ac.in/ds/admissions.html"), ("Fees and fee waivers", "https://study.iitm.ac.in/ds/academics.html")),
    ),
    Program(
        "bits-cs", "BSc in Computer Science", "BITS Pilani", ("software", "data"),
        "undergraduate", "online", 36, None,
        "Covers algorithms, programming, web development and machine learning, with an optional fourth-year honours track.",
        "Review the current admission route for your school qualification. Coursework and exams are delivered online.",
        "Confirm your admission route and request the current total fee for the three-year degree.",
        (("Official program and admissions", "https://www.bits-pilani.ac.in/admissions/online-programme/bachelor-of-science-in-computer-science"),),
    ),
    Program(
        "ignou-bca", "Bachelor of Computer Applications", "IGNOU", ("software", "data"),
        "undergraduate", "online", 36, (49_800, 49_800),
        "An application-focused computing degree. Build statistics and data projects alongside the course if your goal is data science.",
        "Class 12 or equivalent, or the specified commercial-practice diploma route. Exam fees are extra.",
        "Compare the course guide with your target role and check the exam arrangements for your intake.",
        (("Admissions and fees", "https://www.ignou.ac.in/schools/programme/BCA_NEWOL"),),
    ),
    Program(
        "iitm-electronics", "BS in Electronic Systems", "IIT Madras", ("electronics",),
        "undergraduate", "hybrid", 48, (580_000, 580_000),
        "Focuses on electronic systems, embedded computing and hands-on lab work.",
        "Class 12 or equivalent with Physics and Mathematics, plus the applicable entry route. Labs require travel to IIT Madras.",
        "Review the subject requirements and add travel and accommodation for the campus labs to your budget.",
        (("Admissions and lab attendance", "https://study.iitm.ac.in/es/admissions.html"), ("Fees and fee waivers", "https://study.iitm.ac.in/es/academics.html")),
        requires_physics_and_math=True,
    ),
    Program(
        "ignou-bba", "Bachelor of Business Administration", "IGNOU", ("business", "finance"),
        "undergraduate", "distance", 36, (31_500, 31_500),
        "Provides a broad management foundation spanning business operations, marketing and finance.",
        "Class 12 or equivalent. Exam fees are extra.",
        "Check the course guide and identify a practical project or internship you could complete alongside it.",
        (("Admissions and fees", "https://www.ignou.ac.in/schools/programme/BBA"),),
    ),
    Program(
        "ignou-bcom", "Bachelor of Commerce (General)", "IGNOU", ("finance", "business"),
        "undergraduate", "distance", 36, (15_000, 15_000),
        "An option for accounting, commerce and finance fundamentals.",
        "Class 12 in any discipline or equivalent. Exam fees are extra.",
        "Review the accounting modules and check any separate requirements for a professional qualification you want to pursue.",
        (("Admissions and fees", "https://www.ignou.ac.in/schools/programme/BCOMG"),),
    ),
    Program(
        "nid-design", "Bachelor of Design", "National Institute of Design, Ahmedabad", ("design",),
        "undergraduate", "campus", 48, None,
        "Studio-based design education with specialisations across communication, industrial and textile design.",
        "Review the current handbook for school qualification, age and eligibility rules, and both stages of the Design Aptitude Test.",
        "Read the current admissions handbook and check the campus fee schedule before applying.",
        (("Program and specialisations", "https://nid.edu/academics/programmes/bachelor-of-design-bdes.html"),
         ("Current admissions", "https://admissions.nid.edu/NIDA2027/")),
    ),
    Program(
        "ignou-media", "BA in Journalism and Digital Media", "IGNOU", ("media",),
        "undergraduate", "distance", 48, (42_400, 42_400),
        "Covers reporting, media writing and digital production. Build a portfolio from published or practice work.",
        "Class 12 or equivalent. Confirm the total fee and exam charges with the institution for your intake.",
        "Review the practical modules and start a small reporting or digital media project.",
        (("Admissions and fees", "https://www.ignou.ac.in/schools/programme/BAFJDM"),),
    ),
    Program(
        "ignou-psychology", "BA Major in Psychology", "IGNOU", ("psychology",),
        "undergraduate", "distance", 36, (18_000, 18_000),
        "Introduces the study of behaviour and research methods before further psychology study.",
        "Class 12 or equivalent. Check practical requirements and the separate qualifications for any regulated role you plan to pursue.",
        "Confirm practical arrangements and check the entry rules for any postgraduate route you are considering.",
        (("Admissions and fees", "https://www.ignou.ac.in/schools/programme/BAFPC"),),
    ),
    Program(
        "ignou-mca", "Master of Computer Applications", "IGNOU", ("software", "data"),
        "postgraduate", "distance", 24, (52_000, 54_000),
        "Builds postgraduate software skills with computing theory, practical modules and project work.",
        "A qualifying bachelor's degree and Mathematics at Class 12 or degree level. Some degree routes require bridge courses. Exam fees are extra.",
        "Check your bachelor's and Mathematics qualifications against the official entry routes and confirm any bridge courses.",
        (("Admissions and fees", "https://www.ignou.ac.in/schools/programme/MCA_NEW"),),
    ),
    Program(
        "ignou-mba", "Master of Business Administration", "IGNOU", ("business", "finance"),
        "postgraduate", "distance", 24, (66_000, 66_000),
        "Offers postgraduate management training for business, operations and finance goals.",
        "Bachelor's degree of at least three years, with the published marks requirement for your category. Exam fees are extra.",
        "Confirm your marks and compare the specialisations with the work you want to do.",
        (("Admissions and fees", "https://www.ignou.ac.in/schools/programme/MBA"),),
    ),
)

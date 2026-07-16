const { GoogleGenAI } = require("@google/genai");
const { z } = require("zod");
const { zodToJsonSchema } = require("zod-to-json-schema");
const puppeteer = require("puppeteer")


const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY
});

const interviewReportSchema = z.object({
    title: z.string(),

    matchScore: z.number().min(0).max(100),

    technicalQuestions: z.array(z.string()).length(5),

    technicalQuestionIntentions: z.array(z.string()).length(5),

    technicalQuestionAnswers: z.array(z.string()).length(5),

    behavioralQuestions: z.array(z.string()).length(5),

    behavioralQuestionIntentions: z.array(z.string()).length(5),

    behavioralQuestionAnswers: z.array(z.string()).length(5),

    skillGaps: z.array(
        z.object({
            skill: z.string(),
            severity: z.enum(["low", "medium", "high"])
        })
    ).max(5),

    preparationPlan: z.array(
        z.object({
            day: z.number(),
            focus: z.string(),
            tasks: z.array(z.string())
        })
    ).length(7)
});

async function generateInterviewReport({
    resume,
    selfDescription,
    jobDescription
}) {

    const prompt = `
You are an experienced Senior Technical Interviewer and Hiring Manager.

Analyze the candidate.

Return ONLY valid JSON.

DO NOT return markdown.

DO NOT add any extra keys.

The JSON MUST exactly follow the response schema.

Requirements:

- title = Job title
- matchScore = integer between 0 and 100

technicalQuestions
- Exactly 5 strings.

technicalQuestionIntentions
- Exactly 5 strings.
- Each intention corresponds to the technical question at the same index.

technicalQuestionAnswers
- Exactly 5 strings.
- Each answer corresponds to the technical question at the same index.

behavioralQuestions
- Exactly 5 strings.

behavioralQuestionIntentions
- Exactly 5 strings.

behavioralQuestionAnswers
- Exactly 5 strings.

Return skillGaps EXACTLY in this format:

[
  {
    "skill": "SOLID Principles",
    "severity": "medium"
  },
  {
    "skill": "Design Patterns",
    "severity": "high"
  }
]

preparationPlan

- Return EXACTLY 7 objects.
- day must start from 1. Continue this format until day 7.
- Every object must have:
    - day
    - focus
    - tasks
- tasks must contain 3 to 5 strings.

Example:

[
  {
    "day": 1,
    "focus": "SOLID Principles",
    "tasks": [
      "Study SOLID",
      "Read examples",
      "Practice coding"
    ]
  }
]

Resume:

${resume}

Self Description:

${selfDescription}

Job Description:

${jobDescription}
`;
    // const schema = zodToJsonSchema(interviewReportSchema);

    const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            // responseSchema: schema,
            temperature: 0.1
        }
    });
    const result = await ai.models.countTokens({
        model: "gemini-3.1-flash-lite",
        contents: prompt,
    });

    console.log(result.totalTokens);
    const report = JSON.parse(response.text);

    const validation = interviewReportSchema.safeParse(report);

    if (!validation.success) {
        console.dir(validation.error.format(), { depth: null });
        throw new Error("Invalid AI response");
    }

    const validatedReport = validation.data;

    validatedReport.technicalQuestions = validatedReport.technicalQuestions.map((question, index) => ({
        question,
        intention: validatedReport.technicalQuestionIntentions[index],
        answer: validatedReport.technicalQuestionAnswers[index]
    }));

    delete validatedReport.technicalQuestionIntentions;
    delete validatedReport.technicalQuestionAnswers;

    validatedReport.behavioralQuestions = validatedReport.behavioralQuestions.map((question, index) => ({
        question,
        intention: validatedReport.behavioralQuestionIntentions[index],
        answer: validatedReport.behavioralQuestionAnswers[index]
    }));

    delete validatedReport.behavioralQuestionIntentions;
    delete validatedReport.behavioralQuestionAnswers;
    console.dir(validatedReport, { depth: null });
    return validatedReport;
}
async function generatePdfFromHtml(htmlContent) {

    const chromePath = await puppeteer.executablePath();
    console.log("Chrome Path:", chromePath);

    const browser = await puppeteer.launch({
        executablePath: await puppeteer.executablePath(),
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage"
        ]
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" })

    const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        margin: {
            top: "15mm",
            bottom: "15mm",
            left: "15mm",
            right: "15mm"
        }
    })

    await browser.close()

    return pdfBuffer
}
async function generateResumePdf({ resume, selfDescription, jobDescription }) {

    const resumePdfSchema = z.object({
        html: z.string().describe("The HTML content of the resume which can be converted to PDF using any library like puppeteer")
    })

    const prompt = `Generate resume for a candidate with the following details:
                        Resume: ${resume}
                        Self Description: ${selfDescription}
                        Job Description: ${jobDescription}

                        the response should be a JSON object with a single field "html" which contains the HTML content of the resume which can be converted to PDF using any library like puppeteer.
                        The resume should be tailored for the given job description and should highlight the candidate's strengths and relevant experience. The HTML content should be well-formatted and structured, making it easy to read and visually appealing.
                        The content of resume should be not sound like it's generated by AI and should be as close as possible to a real human-written resume.
                        you can highlight the content using some colors or different font styles but the overall design should be simple and professional.
                        The content should be ATS friendly, i.e. it should be easily parsable by ATS systems without losing important information.
                        The resume should not be so lengthy, it should ideally be 2-3 pages long when converted to PDF. Focus on quality rather than quantity and make sure to include all the relevant information that can increase the candidate's chances of getting an interview call for the given job description.

                        Typography Requirements (Very Important):

- Analyze the typography of the provided resume and closely match its visual style.
- Use the same or the closest possible:
  - font family
  - heading font size
  - body font size
  - font weights
  - line spacing
  - spacing between sections
  - bullet indentation
  - text hierarchy
- Preserve the overall professional appearance while rewriting the content for the target job.
- If the exact font used in the original resume cannot be determined, intelligently infer the closest commonly available font (for example: Calibri, Arial, Helvetica, Inter, Aptos, Times New Roman, etc.).
- Keep headings visually similar to the original resume.
- Keep body text size and spacing similar to the original.
- Keep section spacing proportional to the original resume.

                    `

    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: zodToJsonSchema(resumePdfSchema),
        }
    })


    const jsonContent = JSON.parse(response.text)

    const pdfBuffer = await generatePdfFromHtml(jsonContent.html)

    return pdfBuffer

}

module.exports = { generateInterviewReport, generateResumePdf };
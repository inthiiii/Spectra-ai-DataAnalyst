import os
import shutil
import re
import json
import pandas as pd
import io
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from agent import app_graph
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, ToolMessage

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

class QueryRequest(BaseModel):
    query: str

class AnalysisResponse(BaseModel):
    response: str
    chart_data: List[str]
    chart_type: Optional[str]
    file_ready: bool = False 

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        file_path = os.path.join(UPLOAD_DIR, "dataset.csv")
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"message": "File uploaded successfully", "path": file_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/profile")
async def profile_dataset():
    try:
        file_path = os.path.join(UPLOAD_DIR, "dataset.csv")
        df = pd.read_csv(file_path)
        buf = io.StringIO()
        df.info(buf=buf)
        info_str = buf.getvalue()
        head_str = df.head(3).to_string()

        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.7)
        prompt = f"""You are a Data Strategist. Dataset info: {info_str}. Rows: {head_str}.
        Respond with exactly a JSON object: {{"summary": "...", "suggestions": ["...","...","..."]}}"""
        
        response = llm.invoke([HumanMessage(content=prompt)])
        clean_json = response.content.replace("```json", "").replace("```", "").strip()
        return json.loads(clean_json)
    except Exception as e:
        return {"summary": "Dataset ready.", "suggestions": ["Analyze this data", "Check missing values"]}

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_data(request: QueryRequest):
    # SESSION ID
    config = {"configurable": {"thread_id": "spectra_session_safetynet_v1"}} 
    
    inputs = {
        "messages": [HumanMessage(content=request.query)],
        "csv_file_path": os.path.join(UPLOAD_DIR, "dataset.csv") 
    }
    
    final_state = app_graph.invoke(inputs, config=config)
    last_message = final_state["messages"][-1]
    final_text = last_message.content
    
    charts = []
    chart_type = None

    def extract_charts(text):
        found_charts = []
        c_type = None
        plotly_matches = re.findall(r'PLOTLY_JSON_START(.*?)PLOTLY_JSON_END', text, re.DOTALL)
        if plotly_matches:
            found_charts.extend(plotly_matches)
            c_type = 'plotly'
        return found_charts, c_type

    # 1. Check final response text
    charts, chart_type = extract_charts(final_text)
    
    # 2. Check Tool History (Fallback)
    if not charts:
        for msg in reversed(final_state["messages"]):
            if isinstance(msg, ToolMessage):
                found, c_type = extract_charts(msg.content)
                if found:
                    charts.extend(found)
                    chart_type = c_type
                    break
    
    # Clean text
    final_text = re.sub(r'PLOTLY_JSON_START.*?PLOTLY_JSON_END', '', final_text, flags=re.DOTALL)
    
    file_ready = False
    if "[DOWNLOAD_READY]" in final_text:
        file_ready = True
        final_text = final_text.replace("[DOWNLOAD_READY]", "")

    return {
        "response": final_text.strip(),
        "chart_data": charts,
        "chart_type": chart_type,
        "file_ready": file_ready
    }

@app.get("/download")
async def download_cleaned_data():
    file_path = os.path.join(UPLOAD_DIR, "cleaned_dataset.csv")
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type='text/csv', filename="Spectra_Cleaned_Data.csv")
    raise HTTPException(status_code=404, detail="File not found")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
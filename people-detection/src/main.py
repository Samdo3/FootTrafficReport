from ultralytics import YOLO
from datetime import datetime
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from aiohttp import FormData
 
import os
import torch
import cv2
import random
import pandas as pd
import aiohttp
import asyncio
import numpy as np
import base64
 
app = FastAPI()
 
# 프론트엔드에서 전달하는 요청 body의 구조를 정의하는 Pydantic 모델
class DetectionRequest(BaseModel):
    cctv_url: str
    cctv_id: str
 
# Azure API 연결 세부 정보 초기화
class AzureAPI:
    def __init__(self):
        self.url = "https://ai-services123.cognitiveservices.azure.com/customvision/v3.0/Prediction/e2185b3d-d764-4aeb-a672-5c2480425c05/classify/iterations/Iteration1/image"
        self.headers = {
            "Prediction-Key": "GEbnMihAUjSdLaPRMRkMyioJBnQLV45TnpV66sh1tD0BxUO9Nkl9JQQJ99BAACYeBjFXJ3w3AAAEACOG0gLQ",
            "Content-Type": "application/octet-stream"
        }
        self.session = None
 
    # aiohttp 클라이언트 세션 시작
    async def start(self):
        self.session = aiohttp.ClientSession()
 
    # Close the aiohttp client session
    # aiohttp 클라이언트 세션 종료
    async def close(self):
        if self.session:
            await self.session.close()
 
    # Analyze an image using Azure API
    # Azure API를 사용하여 이미지 분석
    async def analyze_image(self, image_path):
        if not self.session:
            await self.start()
        with open(image_path, "rb") as image_file:
            image_data = image_file.read()
        async with self.session.post(self.url, headers=self.headers, data=image_data) as response:
            result = await response.json()
        return self.normalize_predictions(result['predictions'])
   
    # Normalize prediction results
    # 예측 결과 정규화
    def normalize_predictions(self, predictions):
        gender_preds = {p['tagName']: p['probability'] * 100 for p in predictions if p['tagName'] in ['Male', 'Female']}
        age_preds = {p['tagName']: p['probability'] * 100 for p in predictions if p['tagName'] in ['Age18to60', 'AgeOver60', 'AgeLess18']}
       
        def normalize_group(group_preds):
            total = sum(group_preds.values())
            return {k: (v/total)*100 for k, v in group_preds.items()} if total > 0 else group_preds
       
        return {**normalize_group(gender_preds), **normalize_group(age_preds)}
 
# Initialize PersonTracker with model and configuration
# 모델 및 구성으로 PersonTracker 초기화
class PersonTracker:
    def __init__(self, model_path, result_dir='../outputs/results/', tracker_config="../data/config/botsort.yaml", conf=0.5, device=None,
                 iou=0.5, img_size=(720, 1080), output_dir='../outputs/results_video'):
        self.device = device if device else ('cuda:0' if torch.cuda.is_available() else 'cpu')
        self.model = YOLO(model_path)
        self.result_dir = result_dir
        self.tracker_config = tracker_config
        self.conf = conf
        self.iou = iou
        self.img_size = img_size
        self.output_dir = output_dir
        self.color_map = {}
        self.frames = []
        self.boxes = []
        self.detected_ids = set()
        self.captured_objects = set()
        self.detected_ids_full_entry = set()
        self.azure_api = AzureAPI()
   
    def is_fully_inside_frame(self, x1, y1, x2, y2, frame_shape):  # 추가된 코드
        h, w, _ = frame_shape
        return x1 >= 0 and y1 >= 0 and x2 <= w and y2 <= h
  
    # Generate a unique color for each object ID
    # 각 객체 ID에 대한 고유한 색상 생성
    def generate_color(self, obj_id):
        if obj_id not in self.color_map:
            self.color_map[obj_id] = [random.randint(0, 255) for _ in range(3)]
        return self.color_map[obj_id]
    
    # 얼굴 블러처리를 위한 계산
    def estimate_face_area(self, keypoints, box):
        face_keypoints_indices = [0, 1, 2, 3, 4]
        face_keypoints = keypoints[face_keypoints_indices]

        if face_keypoints.shape[1] == 2:
            valid_points = face_keypoints
        elif face_keypoints.shape[1] == 3:
            valid_points = face_keypoints[face_keypoints[:, 2] > 0.3][:, :2]
        else:
            return None

        if len(valid_points) >= 4:
            x_min, y_min = np.maximum(np.min(valid_points, axis=0).astype(int), [box[0], box[1]])
            x_max, y_max = np.minimum(np.max(valid_points, axis=0).astype(int), [box[2], box[3]])

            width = (x_max - x_min) * 20
            height = (y_max - y_min) * 10
            x_min = max(box[0], x_min - int(width * 0.1))
            y_min = max(box[1], y_min - int(height * 0.1))
            x_max = min(box[2], x_max + int(width * 0.1))
            y_max = min(box[3], y_max + int(height * 0.1))

            return x_min, y_min, x_max, y_max

        return None
    # 얼굴 블러
    def apply_face_blur(self, frame, face_area):
        if face_area is not None:
            x_min, y_min, x_max, y_max = face_area

            if x_max > x_min and y_max > y_min:
                face_roi = frame[y_min:y_max, x_min:x_max]
                blurred_roi = cv2.GaussianBlur(face_roi, (25, 25), 0)
                frame[y_min:y_max, x_min:x_max] = blurred_roi
        return frame
 
    # Detect and track people in the video stream
    # 비디오 스트림에서 사람을 감지하고 추적
    async def detect_and_track(self, source, cctv_id):
        results = self.model.track(
            source, show=False, stream=True, tracker=self.tracker_config, conf=self.conf,
            device=self.device, iou=self.iou, stream_buffer=True, classes=[0], imgsz=self.img_size
        )

        await self.azure_api.start()

        for result in results:
            original_frame = result.orig_img.copy()  # 원본 프레임 저장
            display_frame = original_frame.copy()    # 디스플레이용 프레임
            boxes = result.boxes
            keypoints_data = result.keypoints.data.cpu().numpy()

            self.frames.append(display_frame)
            self.boxes.append(boxes)

            tasks = []
            new_object_detected = False

            for box, kpts in zip(boxes, keypoints_data):
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                if box.id is not None:
                    obj_id = int(box.id)
                else:
                    continue

                color = self.generate_color(obj_id)

                if obj_id not in self.detected_ids:
                    self.detected_ids.add(obj_id)
                    face_area = self.estimate_face_area(kpts, [x1, y1, x2, y2])
                    cropped_path, full_frame_path = self.save_cropped_person(original_frame, x1, y1, x2, y2, obj_id, face_area)
                    tasks.append(self.process_person(obj_id, cropped_path, cctv_id, full_frame_path))
                    new_object_detected = True


                face_area = self.estimate_face_area(kpts, [x1, y1, x2, y2])
                if face_area:
                    display_frame = self.apply_face_blur(display_frame, face_area)

                cv2.rectangle(display_frame, (x1, y1), (x2, y2), color, 2)
                cv2.putText(display_frame, f"ID: {obj_id}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

            await asyncio.gather(*tasks)

            if obj_id not in self.detected_ids:
                self.detected_ids.add(obj_id)
                cropped_path = self.save_cropped_person(original_frame, x1, y1, x2, y2, obj_id)
                tasks.append(self.process_person(obj_id, cropped_path, cctv_id))
                new_object_detected = True


            cv2.imshow("Person Tracking", display_frame)

            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break
            elif key == ord('s'):
                while True:
                    if cv2.waitKey(1) & 0xFF == ord('s'):
                        break

        cv2.destroyAllWindows()
        await self.azure_api.close()
        # self.save_blurred_video_prompt()
 
    # Process detected person using Azure API
    # Azure API를 사용하여 감지된 사람 처리
    async def process_person(self, obj_id, cropped_path, cctv_id, full_frame_path):
        threshold = 0.3  # 30% 기준
        predictions = await self.azure_api.analyze_image(cropped_path)
        
        # 라벨 변환 매핑
        age_mapping = {'AgeLess18': 'young', 'Age18to60': 'adult', 'AgeOver60': 'old'}
        gender_mapping = {'Male': 'male', 'Female': 'female'}

        # 성별 예측
        gender_key = max([k for k in predictions if k in gender_mapping and predictions[k] >= threshold], 
                        key=predictions.get, default="Unknown")
        gender = gender_mapping.get(gender_key, "Unknown")

        # 연령대 예측
        age_key = max([k for k in predictions if k in age_mapping and predictions[k] >= threshold], 
                    key=predictions.get, default="Unknown")
        age = age_mapping.get(age_key, "Unknown")
       
        await self.send_data_to_server(obj_id, gender, age, cctv_id, full_frame_path)
 
    # Send analysis results to the backend server
    # 분석 결과를 백엔드 서버로 전송
    async def send_data_to_server(self, obj_id, gender, age, cctv_id, image_path=None):
        """
        obj_id, gender, age 등 텍스트 필드,
        image_path가 있다면 이미지 파일을 multipart/form-data로 전송.
        """
        url = "https://msteam5iseeu.ddns.net/api/cctv_data"

        # 1) FormData 생성
        form = FormData()
        form.add_field("cctv_id", str(cctv_id))
        form.add_field("detected_time", datetime.now().isoformat())
        form.add_field("person_label", str(obj_id))
        form.add_field("gender", gender)
        form.add_field("age", age)

        # 2) 이미지 파일이 있다면 파일을 비동기적으로 읽어 추가
        if image_path:
            try:
                async with aiohttp.ClientSession() as session:
                    with open(image_path, "rb") as f:
                        image_data = f.read()
                    
                    form.add_field(
                        "image_file",
                        image_data,
                        filename="myimage.jpg",  # 원하는 파일명
                        content_type="image/jpeg"  # 혹은 "image/png"
                    )

                    # 3) multipart/form-data로 POST 요청
                    async with session.post(url, data=form) as response:
                        res_json = await response.json()
                        print(res_json)
            except aiohttp.ClientError as e:
                print(f"[ERROR] Failed to send data: {e}")
            finally:
                await session.close()
 
    # Save cropped image of detected person
    # 감지된 사람의 크롭된 이미지 저장    
    def save_cropped_person(self, frame, x1, y1, x2, y2, obj_id, face_area, save_dir="../outputs/"):
        os.makedirs(save_dir + "cropped_people/", exist_ok=True)
        os.makedirs(save_dir + "full_frames/", exist_ok=True)
        
        # 크롭된 이미지 저장
        cropped_file_name = f"{save_dir}cropped_people/person_{obj_id}.jpg"
        cv2.imwrite(cropped_file_name, frame[y1:y2, x1:x2])
        
        # 풀 프레임 처리
        full_frame = frame.copy()
        
        # 바운딩 박스 외부 블러 처리
        mask = np.zeros(full_frame.shape[:2], dtype=np.uint8)
        cv2.rectangle(mask, (x1, y1), (x2, y2), 255, -1)
        blurred = cv2.GaussianBlur(full_frame, (55, 55), 0)
        full_frame = np.where(mask[:,:,None] == 255, full_frame, blurred)

         # 바운딩 박스 그리기
        color = self.generate_color(obj_id)
        cv2.rectangle(full_frame, (x1, y1), (x2, y2), color, 2)
        cv2.putText(full_frame, f"ID: {obj_id}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
            
        # 얼굴 블러 처리
        if face_area:
            fx1, fy1, fx2, fy2 = face_area
            face_roi = full_frame[fy1:fy2, fx1:fx2]
            blurred_face = cv2.GaussianBlur(face_roi, (25, 25), 0)
            full_frame[fy1:fy2, fx1:fx2] = blurred_face
        
        # 풀 프레임 저장
        timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
        full_frame_file_name = f"{save_dir}full_frames/{timestamp}_ID{obj_id}.jpg"
        cv2.imwrite(full_frame_file_name, full_frame)
        
        return cropped_file_name, full_frame_file_name

#-----------------영상 후 블러 처리 코드-----------------

    # # Prompt user to save blurred video
    # # 사용자에게 블러 처리된 비디오 저장 여부 묻기
    # def save_blurred_video_prompt(self):
    #     save_input = input("Do you want to save the blurred video? (y/n): ").strip().lower()
    #     if save_input == 'y':
    #         self.save_blurred_video()
    #     elif save_input == 'n':
    #         print("Video not saved.")
    #     else:
    #         print("Invalid input. Please enter 'y' or 'n'.")
    #         self.save_blurred_video_prompt()
 
    # # Save video with blurred faces
    # # 얼굴이 블러 처리된 비디오 저장
    # def save_blurred_video(self):
    #     os.makedirs(self.output_dir, exist_ok=True)
    #     video_name = datetime.now().strftime("%Y-%m-%d-%H-%M-%S") + "_blurred.webm"
    #     output_path = os.path.join(self.output_dir, video_name)
       
    #     fourcc = cv2.VideoWriter_fourcc(*'VP80')
    #     height, width, _ = self.frames[0].shape
    #     out = cv2.VideoWriter(output_path, fourcc, 30, (width, height))
       
    #     for frame, boxes in zip(self.frames, self.boxes):
    #         for box in boxes:
    #             x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
    #             roi = frame[y1:y2, x1:x2]
    #             blurred_roi = cv2.GaussianBlur(roi, (15, 15), 0)
    #             frame[y1:y2, x1:x2] = blurred_roi
 
    #         out.write(frame)
 
    #     out.release()
    #     print(f"Blurred video saved at {output_path}")

#-----------------영상 후 블러 처리 코드-----------------

'''
Test code 할때는 __name__ == "__main__"으로 실행 (detect_people 함수는 주석 처리)
웹으로 호출해서 실제 cctv에서 실행할때는 detect_people로 실행 (__name__ == "__main__" 주석 처리)
'''
# 웹으로 호출되는 함수
@app.post("/detect") 
async def detect_people(request: DetectionRequest):
    try:
        tracker = PersonTracker(
            model_path='FootTrafficReport/people-detection/model/yolo11n-pose.pt'
        )
        result = await tracker.detect_and_track(source=request.cctv_url, cctv_id=request.cctv_id)
        return result
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8500)


# #Test할때 하는 작업 (cctv_id는 임의로 설정)
# if __name__ == '__main__':
#     source = "../data/videos/05_seoul.mp4"
#     tracker = PersonTracker(model_path='../model/yolo11n-pose.pt')
#     asyncio.run(tracker.detect_and_track(source=source, cctv_id=1))

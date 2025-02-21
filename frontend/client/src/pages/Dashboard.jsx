import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import * as echarts from "echarts"; // npm install echarts

function Dashboard() {
  const location = useLocation();

  // 탭 활성 로직
  const isMonitorActive = location.pathname === "/monitor";
  const isDashboardActive = location.pathname === "/dashboard";
  const isAiInsightActive = location.pathname === "/ai-insight";
  const isChatbotActive = location.pathname === "/chatbot";
  const isGuideActive = location.pathname === "/guide";

  // 상단 CCTV 선택 & 기간 선택
  const [selectedCCTV, setSelectedCCTV] = useState("CCTV 1");
  const [selectedPeriod, setSelectedPeriod] = useState("오늘");

  // 버튼 목록
  const [cctvList, setCctvList] = useState([]);
  const periodList = ["오늘", "어제", "1주일", "1달"];

  // 차트 전환(시간대별, 성별 비율, etc.)
  const chartModes = ["time", "gender"];
  const [chartIndex, setChartIndex] = useState(0);
  const currentChart = chartModes[chartIndex];

  const handlePrevChart = () => {
    setChartIndex((prev) => (prev - 1 + chartModes.length) % chartModes.length);
  };

  const handleNextChart = () => {
    setChartIndex((prev) => (prev + 1) % chartModes.length);
  };

  const [stats, setStats] = useState({
    totalVisitors: 0,
    peakTime: "00:00-00:00",
    mainAgeRange: "N/A",
    mainGender: "N/A",
  });

  //API 호출 함수
  const fetchPersonCounts = async () => {
    try {
      const response = await fetch("/api/person_count/1");
      const data = await response.json();
      console.log("PersonCount 목록:", data);
      return data;
    } catch (error) {
      console.error("에러 발생:", error);
      return null;
    }
  };

  // 오늘 날짜만 필터링하는 함수 (selectedPerid == "Today" 일때 사용)
  const filterTodayData = (data) => {
    const now = new Date(); // 예: 2025-02-18 09:xx
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0
    );
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59
    );

    return data.filter((row) => {
      const rowDate = new Date(row.timestamp);
      return rowDate >= startOfToday && rowDate <= endOfToday;
    });
  };

  // 어제 날짜만 필터링하는 함수 (selectedPerid == "Yesterday" 일때 사용)
  const filterYesterdayData = (data) => {
    const now = new Date(); // 예: 2025-02-18 09:xx
    const startOfYesterday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1,
      0,
      0,
      0
    );
    const endOfYesterday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1,
      23,
      59,
      59
    );

    return data.filter((row) => {
      const rowDate = new Date(row.timestamp);
      return rowDate >= startOfYesterday && rowDate <= endOfYesterday;
    });
  };

  //일주일 날짜만 필터링하는 함수 (selectedPerid == "1주일" 일때 사용)
  const filterWeekdayData = (data) => {
    const now = new Date(); // 예: 2025-02-18 09:xx
    const startOfWeekday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 7,
      0,
      0,
      0
    );
    const endOfWeekday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59
    );

    return data.filter((row) => {
      const rowDate = new Date(row.timestamp);
      return rowDate >= startOfWeekday && rowDate <= endOfWeekday;
    });
  };

  //한달 날짜만 필터링하는 함수 (selectedPerid == "1달" 일때 사용)
  const filterMonthData = (data) => {
    const now = new Date();
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      now.getDate(),
      0,
      0,
      0
    );
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59
    );

    return data.filter((row) => {
      const rowDate = new Date(row.timestamp);
      return rowDate >= startOfMonth && rowDate <= endOfMonth;
    });
  };

  const calculateStats = (data) => {
    let total = 0;
    let peakCount = 0;
    let peakHour = "";
    let sumMale = 0;
    let sumFemale = 0;
    let sumYoung = 0; // 20~59
    let sumMiddle = 0; // 60 이상
    let sumMinor = 0; // 0~19

    data.forEach((row) => {
      const hourTotal =
        row.male_young_adult +
        row.female_young_adult +
        row.male_middle_aged +
        row.female_middle_aged +
        row.male_minor +
        row.female_minor;

      // 총합
      total += hourTotal;

      // 피크 시간대
      if (hourTotal > peakCount) {
        peakCount = hourTotal;

        const dateObj = new Date(row.timestamp);
        const hour = dateObj.getHours(); // 15
        const hourStr = String(hour).padStart(2, "0");
        const nextHourStr = String((hour + 1) % 24).padStart(2, "0");

        peakHour = `${hourStr}:00 - ${nextHourStr}:00`;
      }

      // 성별 합
      sumMale += row.male_young_adult + row.male_middle_aged + row.male_minor;
      sumFemale +=
        row.female_young_adult + row.female_middle_aged + row.female_minor;

      // 연령대 합
      sumYoung += row.male_young_adult + row.female_young_adult;
      sumMiddle += row.male_middle_aged + row.female_middle_aged;
      sumMinor += row.male_minor + row.female_minor;
    });

    // 총 방문자 수가 0명이면 바로 N/A 처리
    if (total === 0) {
      return {
        totalVisitors: 0,
        peakTime: "00:00-00:00",
        mainAgeRange: "N/A",
        mainGender: "N/A",
      };
    }

    // 주요 성별
    const mainGender = sumMale > sumFemale ? "남성" : "여성";

    // 주요 연령대
    let mainAgeRange = "N/A";
    if (sumYoung >= sumMiddle && sumYoung >= sumMinor) {
      mainAgeRange = "성인층 (20세~59세)";
    } else if (sumMiddle >= sumYoung && sumMiddle >= sumMinor) {
      mainAgeRange = "노인층 (60세 이상)";
    } else {
      mainAgeRange = "청소년층(19세 이하)";
    }

    return {
      totalVisitors: total,
      peakTime: peakHour,
      mainAgeRange,
      mainGender,
    };
  };

  //Echarts 차트
  const chartRef = useRef(null);
  const [chartInstance, setChartInstance] = useState(null);

  useEffect(() => {
    if (chartRef.current) {
      const instance = echarts.init(chartRef.current);
      setChartInstance(instance);
    }
  }, []);

  //데이터 로드 및 차트 업데이트
  useEffect(() => {
    const loadData = async () => {
      const data = await fetchPersonCounts();
      if (!data) return;

      // CCTV 목록 업데이트: 데이터에서 고유한 cctv_id 추출 후, "CCTV {id}" 형식으로 변환
      const uniqueCctvIds = Array.from(
        new Set(data.map((item) => item.cctv_id))
      );
      const formattedCctvList = uniqueCctvIds.map((id) => `CCTV ${id}`);
      setCctvList(formattedCctvList);

      const cctvNumber = parseInt(selectedCCTV.replace("CCTV ", ""), 10);
      let filteredData = data.filter((row) => row.cctv_id === cctvNumber);

      if (selectedPeriod === "오늘") {
        filteredData = filterTodayData(filteredData);
      } else if (selectedPeriod === "어제") {
        filteredData = filterYesterdayData(filteredData);
      } else if (selectedPeriod == "1주일") {
        filteredData = filterWeekdayData(filteredData);
      } else if (selectedPeriod == "1달") {
        filteredData = filterMonthData(filteredData);
      }

      const result = calculateStats(filteredData);
      setStats(result);

      //차트 모드에 따라 라인 or 파이
      if (!chartInstance) return;

      if (currentChart === "time") {
        updateLineChart(filteredData);
      } else {
        updatePieChart(filteredData);
      }
    };
    loadData();
    //여기 수정함
  }, [selectedCCTV, selectedPeriod, currentChart, chartInstance]);

  //시간대별 방문자 통계
  const updateLineChart = (filteredData) => {
    const hours = Array.from({ length: 24 }, (_, i) => i);

    const totalArr = new Array(24).fill(0);
    const teenArr = new Array(24).fill(0); // 0~19
    const adultArr = new Array(24).fill(0); // 20~59
    const seniorArr = new Array(24).fill(0); // 60 이상

    filteredData.forEach((row) => {
      const dateObj = new Date(row.timestamp);
      const h = dateObj.getHours();
      const minor = row.male_minor + row.female_minor; // 0~19
      const young = row.male_young_adult + row.female_young_adult; // 20~59
      const middle = row.male_middle_aged + row.female_middle_aged; // 60 이상

      const sum = minor + young + middle;

      if (h >= 0 && h < 24) {
        totalArr[h] += sum;
        teenArr[h] += minor;
        adultArr[h] += young;
        seniorArr[h] += middle;
      }
    });

    // 3) X축 레이블:
    const xAxisData = hours.map((h) => String(h).padStart(4) + "시");

    // 4) ECharts 옵션
    const option = {
      tooltip: {
        trigger: "axis",
        formatter: (params) => {
          let result = params[0].axisValue + "<br/>";
          params.forEach((param) => {
            result += `${param.seriesName}: ${param.value}명<br/>`;
          });
          return result;
        },
      },
      legend: {
        show: true,
        orient: "horizontal",
        top: 20,
        left: "center",
        data: ["총 방문자", "청소년층", "성인층", "노년층"],
      },
      xAxis: {
        type: "category",
        data: xAxisData,
      },
      yAxis: {
        type: "value",
      },
      series: [
        {
          name: "총 방문자",
          type: "line",
          data: totalArr,
          color: "#5470c6",
          smooth: true,
        },
        {
          name: "청소년층",
          type: "line",
          data: teenArr,
          color: "#ee6666",
          smooth: true,
        },
        {
          name: "성인층",
          type: "line",
          data: adultArr,
          color: "#73c0de",
          smooth: true,
        },
        {
          name: "노년층",
          type: "line",
          data: seniorArr,
          color: "#3ba272",
          smooth: true,
        },
      ],
    };
    chartInstance.setOption(option);
  };

  // 원형 차트로 표시
  const updatePieChart = (filteredData) => {
    chartInstance.clear();

    // 남성/여성 합계
    let sumMale = 0;
    let sumFemale = 0;

    filteredData.forEach((row) => {
      const maleCount =
        row.male_young_adult + row.male_middle_aged + row.male_minor;
      const femaleCount =
        row.female_young_adult + row.female_middle_aged + row.female_minor;
      sumMale += maleCount;
      sumFemale += femaleCount;
    });

    // 퍼센트 계산
    const total = sumMale + sumFemale;
    const malePercent = total === 0 ? 0 : ((sumMale / total) * 100).toFixed(1);
    const femalePercent =
      total === 0 ? 0 : ((sumFemale / total) * 100).toFixed(1);

    const option = {
      animation: false,
      tooltip: {
        trigger: "item",
      },
      legend: {
        orient: "vertical",
        top: 20,
        left: 20,
        data: [`남성 ${malePercent}%`, `여성 ${femalePercent}%`],
      },
      series: [
        {
          name: "성별 비율",
          type: "pie",
          radius: "50%",
          data: [
            { value: sumMale, name: `남성 ${malePercent}%` },
            { value: sumFemale, name: `여성 ${femalePercent}%` },
          ],
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: "rgba(0, 0, 0, 0.5)",
            },
          },
        },
      ],
    };
    chartInstance.setOption(option);
  };

  return (
    <div className="bg-gray-50">
      {/* 상단 Nav */}
      <nav className="bg-white shadow">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            {/* 왼쪽 탭 */}
            <div className="flex items-center space-x-8">
              <span className="text-xl font-bold text-black">I See U</span>
              <div className="flex space-x-3">
                {/* 내 모니터링 */}
                <Link
                  to="/monitor"
                  className={`inline-flex items-center px-1 pt-1 nav-link ${
                    isMonitorActive
                      ? "bg-black text-white font-medium"
                      : "text-gray-500 hover:text-black"
                  }`}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "0.375rem",
                    transition: "all 0.3s ease",
                    backgroundColor: isMonitorActive ? "#000000" : "#f3f4f6",
                    color: isMonitorActive ? "#ffffff" : "#000000",
                  }}
                >
                  내 모니터링
                </Link>

                {/* 통계 분석 (현재 페이지) */}
                <Link
                  to="/dashboard"
                  className={`inline-flex items-center px-1 pt-1 nav-link ${
                    isDashboardActive
                      ? "bg-black text-white font-medium"
                      : "text-gray-500 hover:text-black"
                  }`}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "0.375rem",
                    transition: "all 0.3s ease",
                    backgroundColor: isDashboardActive ? "#000000" : "#f3f4f6",
                    color: isDashboardActive ? "#ffffff" : "#000000",
                  }}
                >
                  통계 분석
                </Link>

                {/* AI 인사이트 */}
                <Link
                  to="/ai-insight"
                  className={`inline-flex items-center px-1 pt-1 nav-link ${
                    isAiInsightActive
                      ? "bg-black text-white font-medium"
                      : "text-gray-500 hover:text-black"
                  }`}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "0.375rem",
                    transition: "all 0.3s ease",
                    backgroundColor: isAiInsightActive ? "#000000" : "#f3f4f6",
                    color: isAiInsightActive ? "#ffffff" : "#000000",
                  }}
                >
                  AI 인사이트
                </Link>

                {/* 챗봇 */}
                <Link
                  to="/chatbot"
                  className={`inline-flex items-center px-1 pt-1 nav-link ${
                    isChatbotActive
                      ? "bg-black text-white font-medium"
                      : "text-gray-500 hover:text-black"
                  }`}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "0.375rem",
                    transition: "all 0.3s ease",
                    backgroundColor: isChatbotActive ? "#000000" : "#f3f4f6",
                    color: isChatbotActive ? "#ffffff" : "#000000",
                  }}
                >
                  챗봇
                </Link>

                {/* 사용 방법 */}
                <Link
                  to="/guide"
                  className={`inline-flex items-center px-1 pt-1 nav-link ${
                    isGuideActive
                      ? "bg-black text-white font-medium"
                      : "text-gray-500 hover:text-black"
                  }`}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "0.375rem",
                    transition: "all 0.3s ease",
                    backgroundColor: isGuideActive ? "#000000" : "#f3f4f6",
                    color: isGuideActive ? "#ffffff" : "#000000",
                  }}
                >
                  사용 방법
                </Link>

                {/* 개인정보법 안내 */}
                <button
                  type="button"
                  className="inline-flex items-center px-1 pt-1 text-gray-500 hover:text-black nav-link"
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "0.375rem",
                    transition: "all 0.3s ease",
                    backgroundColor: "#f3f4f6",
                    color: "#000000",
                  }}
                >
                  개인정보법 안내
                </button>
              </div>
            </div>

            {/* 오른쪽 알림/설정/사용자 */}
            <div className="flex items-center">
              <button className="p-2 rounded-full hover:bg-gray-100 relative">
                <i className="fas fa-bell text-gray-600"></i>
                <span className="absolute top-1 right-1 bg-red-500 rounded-full w-2 h-2" />
              </button>
              <button className="ml-3 p-2 rounded-full hover:bg-gray-100">
                <i className="fas fa-cog text-gray-600"></i>
              </button>
              <div className="ml-4 flex items-center">
                <img
                  className="h-8 w-8 rounded-full"
                  src="/기본프로필.png"
                  alt="사용자 프로필"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">
                  김관리자
                </span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* 메인 레이아웃 */}
      <div
        className="flex bg-gray-50"
        style={{ minHeight: "calc(100vh - 4rem)" }}
      >
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-8">
            <h1 className="text-2xl font-semibold text-gray-900 mb-6">
              통계 분석
            </h1>

            {/* 상단 CCTV 선택 버튼들 */}
            <div className="flex items-center space-x-4 mb-6">
              {cctvList.map((cctv) => (
                <button
                  key={cctv}
                  onClick={() => setSelectedCCTV(cctv)}
                  className={`px-4 py-2 rounded-md transition-colors ${
                    selectedCCTV === cctv
                      ? "bg-black text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  {cctv}
                </button>
              ))}
            </div>

            {/* 기간 선택 버튼들 */}
            <div className="flex items-center space-x-4 mb-8">
              {periodList.map((period) => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  className={`px-4 py-2 rounded-md transition-colors ${
                    selectedPeriod === period
                      ? "bg-black text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>

            {/* 하단 2-Column 레이아웃: 좌측(현황 통계 표), 우측(차트) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 왼쪽: 현황 통계 (표) */}
              <div className="bg-white shadow rounded-lg overflow-hidden p-6">
                {/* 총 방문자 수가 0이면 경고 메시지 출력 */}
                {stats.totalVisitors === 0 && (
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
                    <div className="flex items-center">
                      <i className="fas fa-exclamation-triangle text-yellow-400 mr-3"></i>
                      <p className="text-sm text-yellow-700">
                        데이터를 불러올 수 없습니다. CCTV 연결 상태를 확인해
                        주세요.
                      </p>
                    </div>
                    <p className="text-xs text-yellow-600 mt-2">
                      심야 시간대(00시~01시)는 데이터가 제한될 수 있습니다.
                    </p>
                  </div>
                )}
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  현황 통계
                </h2>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">
                        구분
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">
                        {selectedPeriod}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-base font-medium text-gray-800">
                        총 방문자 수
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-base text-gray-800">
                        {stats.totalVisitors}명
                      </td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-base font-medium text-gray-800">
                        피크 시간대
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-base text-gray-800">
                        {stats.peakTime}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-base font-medium text-gray-800">
                        주요 연령대
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-base text-gray-800">
                        {stats.mainAgeRange}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-base font-medium text-gray-800">
                        주요 성별
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-base text-gray-800">
                        {stats.mainGender}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 오른쪽: 차트 영역 */}
              <div className="bg-white shadow rounded-lg p-6 relative">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {currentChart === "time"
                      ? "시간대별 방문자 통계"
                      : "성별 비율"}
                  </h2>
                  <div className="space-x-3">
                    <button
                      className="p-2 rounded-full hover:bg-gray-100 border border-gray-200"
                      onClick={handlePrevChart}
                    >
                      <i className="fas fa-chevron-left text-gray-500"></i>
                    </button>
                    <button
                      className="p-2 rounded-full hover:bg-gray-100 border border-gray-200"
                      onClick={handleNextChart}
                    >
                      <i className="fas fa-chevron-right text-gray-500"></i>
                    </button>
                  </div>
                </div>

                {/* 차트가 들어갈 실제 컨테이너 (항상 렌더링) */}
                <div
                  ref={chartRef}
                  style={{
                    width: "100%",
                    height: "360px",
                    // 필요하다면 테두리 추가 가능: border: "1px solid #e5e7eb"
                  }}
                />

                {/* 방문자 수가 0명이면, 차트 위에 덮어씌우는 오버레이 */}
                {stats.totalVisitors === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white">
                    <i className="fas fa-chart-pie text-gray-300 text-5xl mb-4"></i>
                    <p className="text-gray-500 text-mm">데이터가 없습니다</p>
                    <p className="text-gray-400 text-xs mt-2">
                      심야 시간대(00시~01시)는 데이터가 제한될 수 있습니다.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default Dashboard;

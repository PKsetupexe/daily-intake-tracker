export const EXERCISE_RULES = `运动名称与标准耗能规则（优先于旧步行估算规则）：
1. 运动名称必须保留影响耗能的强度、配速、速度、坡度或负重。中等强度健身房运动和较低强度健身房运动分开，8分配跑步和5分配跑步分开。同义描述统一：健身房力量训练、力量训练（无氧）、抗阻训练统一为力量训练，骑自行车统一为骑行。相同强度下模型给出的MET只是估算依据，放note，不按不同MET拆库。总时长、日期、次数等移入note，duration保存本次分钟数；不得把强度只写在备注。sex取male/female/unspecified，优先沿用原记录，否则取用户资料，不猜测。
2. 非步行运动仍由用户或模型给出本次净活动热量与时长，软件换算每10分钟。提供有效duration，否则无法入运动库。跑步即使带steps也不是步行，不得套用每千步步行费率。
3. 步行单独记录kind:"walking"、steps。walkingContext提供对应日期和性别的caloriesPer1000；只要不为null，calories必须=steps*caloriesPer1000/1000，不得用MET、体重另算或覆盖费率，也不能把跑步的步数再记为步行。
4. 自动步行模式使用体重线性公式；manual手动模式数值固定，不随体重变化。只有walkingContext.canLlmEstimate为true（手动且尚未填写费率）时，才允许你自行估算步行净活动热量并提供steps、calories和note依据，软件据此保存每1000步费率，之后使用该固定值。自动模式缺少体重时请用户先记录体重，不能自行填一个猜测值。
5. 不得在actions直接修改walkingProfiles或exerciseLibrary；只提交日常exercises、weights等记录。每次步行只有一条记录，不同时按时长追加重复运动。历史记录修正保留id。`;

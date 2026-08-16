import mongoose, { Schema, Document, Model } from 'mongoose';

interface IReview {
  source: string;
  text: string;
  gradeReceived: string;
  date: Date;
}

export interface IGradeDistribution {
  aPercent: number;
  bPercent: number;
  cPercent: number;
  dPercent: number;
  fPercent: number;
}

export interface IProfessor extends Document {
  fullName: string;
  averageGrade: string;
  gpa: number;
  passRate: number;
  difficulty: number;
  wouldTakeAgain: number;
  recentReviews: IReview[];
  lastUpdated: Date;
  gradeDistribution?: IGradeDistribution;
  riskFlags?: string[];
}

const ProfessorSchema = new Schema<IProfessor>({
  fullName: { type: String, required: true, unique: true, trim: true },
  averageGrade: { type: String, default: 'N/A' },
  gpa: { type: Number, default: 0 },
  passRate: { type: Number, default: 0 },
  difficulty: { type: Number, default: 0 },
  wouldTakeAgain: { type: Number, default: 0 },
  recentReviews: [{
    source: { type: String, enum: ['Gritview', 'RMP'] },
    text: { type: String },
    gradeReceived: { type: String },
    date: { type: Date }
  }],
  gradeDistribution: {
    aPercent: { type: Number, default: 0 },
    bPercent: { type: Number, default: 0 },
    cPercent: { type: Number, default: 0 },
    dPercent: { type: Number, default: 0 },
    fPercent: { type: Number, default: 0 }
  },
  riskFlags: [{ type: String }],
  lastUpdated: { type: Date, default: Date.now }
});

const Professor: Model<IProfessor> =
  (mongoose.models.Professor as Model<IProfessor>) ||
  mongoose.model<IProfessor>('Professor', ProfessorSchema);

export default Professor;
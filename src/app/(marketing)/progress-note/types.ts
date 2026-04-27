import {
  UseFormRegister,
  UseFormWatch,
  UseFormSetValue,
  Control,
  FieldErrors,
} from 'react-hook-form';

export type FormValues = Record<string, string>;

export interface FormPageProps {
  formRef: React.RefObject<HTMLFormElement>;
  register: UseFormRegister<FormValues>;
  watch: UseFormWatch<FormValues>;
  setValue: UseFormSetValue<FormValues>;
  control: Control<FormValues>;
  errors?: FieldErrors<FormValues>;
}
